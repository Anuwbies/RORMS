import assert from 'node:assert/strict'
import { test } from 'node:test'
import { facilityActivity, facilityValue } from '../src/utils/facilityLog.ts'

test('new facility records show creation summaries without initialization arrows', () => {
  const changes = { name: { before: null, after: 'PTC' }, capacity: { before: null, after: 50 } }
  assert.deepEqual(facilityActivity('facility.room_created', changes, {}, 0), { action: 'Added room', detail: 'Created a new room.' })
  assert.equal(facilityActivity('facility.building_created', changes, {}, 0).detail, 'Created a new building.')
})

test('edits show specific changes, zero values, availability and human-readable image changes', () => {
  const result = facilityActivity('facility.room_updated', {
    capacity: { before: 0, after: 50 }, status: { before: 'Available', after: 'Maintenance' },
    amenities: { before: [], after: ['WiFi', 'Projector'] }, image: { before: 'https://old', after: 'https://new' },
  }, {}, 0)
  assert.equal(result.detail, 'Capacity: 0 → 50\nAvailability: Available → Maintenance\nAmenities: None → WiFi, Projector\nUpdated room image.')
})

test('deletions identify cascaded room counts and comment authors', () => {
  assert.equal(facilityActivity('facility.building_deleted', {}, {}, 2).detail, 'Removed the building and 2 rooms.')
  assert.equal(facilityActivity('facility.building_deleted', {}, {}, 1).detail, 'Removed the building and 1 room.')
  assert.equal(facilityActivity('facility.building_deleted', {}, {}, 0).detail, 'Removed the building.')
  assert.equal(facilityActivity('facility.comment_deleted', {}, { authorName: 'Cruz, Juan' }, 0).detail, 'Removed a comment by Cruz, Juan.')
  assert.equal(facilityValue(null), 'Not set')
})
