import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function harness(handler, overrides = {}, file = 'pages/tabs/BuildingsRoomsPage.tsx') {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === handler) expression = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert(expression)
  const calls = [], timeline = [], notices = []
  let nextId = 0
  const currentRoom = { id: 'room', name: 'PTC 201', image: 'https://old', code: 'PTC-201' }
  const context = {
    module: {}, console: { error() {} }, db: {}, storage: {}, Blob,
    rooms: [currentRoom], buildings: [], editingBuilding: null, editingRoom: null,
    roomToDelete: currentRoom, buildingToDelete: { id: 'building', name: 'PTC', rooms: [] },
    newBuildingName: 'New Building', newBuildingCode: 'NEW', activeBuildingId: 'building',
    newRoomName: 'New Room', newRoomCode: 'NEW-201', roomModalStep: 3, isMultipleRooms: false,
    newRoomType: 'Laboratory', newRoomFloor: '2', newRoomCapacity: '50', newRoomStatus: 'Available',
    newRoomDescription: 'Laboratory', newRoomAmenities: [], newRoomAvailableDays: ['Monday'],
    newRoomMinBookingMins: '30', newRoomMaxBookingMins: '90', newRoomStartTime: '07:30', newRoomEndTime: '18:00',
    newRoomImage: 'https://image', DEFAULT_ROOM_IMAGE: 'default', pendingRoomImageBlob: null,
    roomNamePrefix: 'PTC', formattedRoomNamePrefix: 'PTC ', roomCodePrefix: 'PTC-', roomStartNumber: '202', roomEndNumber: '203',
    canManageBuildings: true, isDeletingRooms: false, isBulkDeleteConfirmation: true,
    bulkDeleteBuilding: { id: 'building', name: 'PTC' }, selectedRoomsToDelete: [currentRoom],
    collection: (_db, name) => name, doc: () => ({ id: `new-${++nextId}` }),
    manageFacility: async input => {
      timeline.push('mutation')
      calls.push(input)
      return { changed: true, deletedRooms: input.action.startsWith('delete_') ? [{ id: 'room', image: 'https://old' }] : [] }
    },
    ref: (_storage, path) => path,
    uploadBytesResumable: async () => timeline.push('upload'), getDownloadURL: async () => 'https://uploaded',
    deleteImageFromStorage: async image => timeline.push(`cleanup:${image}`),
    facilityActionError: (_error, fallback) => fallback,
    handleCloseModals() {}, handleCloseDeleteRoomModal() {}, handleCloseDeleteBuildingModal() {}, handleCloseBulkDeleteRooms() {}, handleOpenRoomModal() {},
    showNotification: (message, kind) => notices.push({ message, kind }),
    user: { uid: 'actor' }, auth: { currentUser: { uid: 'actor' } }, canModerateComments: false, deleting: { current: false },
  }
  for (const setter of expression.getText(ast).match(/\bset[A-Z]\w+/g) || []) context[setter] = () => {}
  Object.assign(context, overrides)
  vm.runInNewContext(ts.transpileModule(`module.exports = ${expression.getText(ast)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText, context)
  return { run: (argument = { preventDefault() {} }) => context.module.exports(argument), calls, timeline, notices }
}

test('building creation uses the audited callable and keeps automatic room setup', async () => {
  let opened
  const state = harness('handleBuildingSubmit', { handleOpenRoomModal: id => { opened = id } })
  await state.run()
  assert.equal(state.calls[0].action, 'create_building')
  assert.equal(state.calls[0].data.name, 'New Building')
  assert.equal(opened, state.calls[0].targetId)
})

test('single room deletion cleans up its image only after the audited deletion', async () => {
  const state = harness('handleDeleteRoomSubmit')
  await state.run()
  assert.deepEqual(state.timeline, ['mutation', 'cleanup:https://old'])
  assert.equal(state.calls[0].action, 'delete_room')
})

test('failed deletion leaves the image intact and reports failure', async () => {
  const state = harness('handleDeleteRoomSubmit', { manageFacility: async () => { throw new Error('failed log') } })
  await state.run()
  assert.deepEqual(state.timeline, [])
  assert.equal(state.notices[0].kind, 'error')
})

test('building deletion cleans up rooms returned by the server even when its client list was empty', async () => {
  const state = harness('handleDeleteBuildingSubmit')
  await state.run()
  assert.deepEqual(state.timeline, ['mutation', 'cleanup:https://old'])
  assert.equal(state.calls[0].action, 'delete_building')
})

test('room editing logs the final uploaded image before removing its old image', async () => {
  const state = harness('handleRoomSubmit', { editingRoom: { id: 'room', image: 'https://old' }, pendingRoomImageBlob: new Blob(['image']) })
  await state.run()
  assert.deepEqual(state.timeline, ['upload', 'mutation', 'cleanup:https://old'])
  assert.equal(state.calls[0].action, 'update_room')
  assert.equal(state.calls[0].data.image, 'https://uploaded')
})

test('bulk room creation sends one audited creation per room with its final image', async () => {
  const state = harness('handleRoomSubmit', { isMultipleRooms: true, pendingRoomImageBlob: new Blob(['image']) })
  await state.run()
  assert.deepEqual(state.calls.map(call => call.data.name), ['PTC 202', 'PTC 203'])
  assert(state.calls.every(call => call.action === 'create_room' && call.data.image === 'https://uploaded'))
  assert.deepEqual(state.timeline, ['upload', 'mutation', 'upload', 'mutation'])
})

test('bulk deletion keeps audited transaction chunks within the supported size', async () => {
  const selected = Array.from({ length: 201 }, (_, index) => ({ id: `room-${index}`, image: `https://image-${index}` }))
  const state = harness('handleBulkDeleteRoomsSubmit', { selectedRoomsToDelete: selected, rooms: selected })
  await state.run()
  assert.deepEqual(state.calls.map(call => call.roomIds.length), [200, 1])
  assert(state.calls.every(call => call.action === 'delete_rooms' && call.buildingId === 'building'))
})

test('comment deletion uses the audited callable and retains the UI ownership guard', async () => {
  const state = harness('handleDelete', {}, 'components/RoomComments.tsx')
  await state.run({ id: 'foreign', authorId: 'other' })
  assert.equal(state.calls.length, 0)
  await state.run({ id: 'own', authorId: 'actor' })
  assert.equal(state.calls.length, 1)
  assert.equal(state.calls[0].action, 'delete_comment')
  assert.equal(state.calls[0].targetId, 'own')
})
