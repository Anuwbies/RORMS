import { useRef, useState } from 'react'
import { collection, doc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { db, storage } from '../firebase'
import { manageFacility, facilityActionError } from '../services/facilityManagement'
import { DEFAULT_ROOM_IMAGE, type Facility, type RoomStatus } from '../types/room'
import { Button } from './Button'
import { CameraIcon, UploadIcon } from './Icons'
import { CropModal } from './CropModal'
import { NumberInput } from './NumberInput'
import { RoomAmenities } from './RoomAmenities'
import { SingleSelectDropdown } from './SingleSelectDropdown'
import { TextAreaInput } from './TextAreaInput'
import { TextInput } from './TextInput'
import { TimePicker } from './TimePicker'

interface AddFacilityModalProps {
  buildingId: string
  facilities: Facility[]
  onClose: () => void
  onSaved: (name: string) => void
  onNotify: (message: string, type: 'error' | 'warning' | 'info' | 'success' | 'brand', title: string) => void
}

const TYPE_SUGGESTIONS = ['AVR', 'Crime Lab', 'Auditorium']
const AMENITIES = [
  'WiFi', 'Computer', 'Television', 'Air Conditioning', 'Sound System',
  'Projector', 'Whiteboard', 'Printer', 'Webcam', 'Microphone',
  'Ethernet', 'Speakers', 'HDMI Cable', 'Charging Station', 'Video Conferencing',
]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const BOOKING_OPTIONS = ['30', '60', '90']

export function AddFacilityModal({ buildingId, facilities, onClose, onSaved, onNotify }: AddFacilityModalProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [floor, setFloor] = useState('1')
  const [capacity, setCapacity] = useState('50')
  const [type, setType] = useState('')
  const [status, setStatus] = useState<RoomStatus>('Available')
  const [image, setImage] = useState(DEFAULT_ROOM_IMAGE)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [cropSource, setCropSource] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [description, setDescription] = useState('')
  const [amenities, setAmenities] = useState<string[]>([])
  const [availableDays, setAvailableDays] = useState<string[]>(DAYS.slice(0, 5))
  const [startTime, setStartTime] = useState('07:30')
  const [endTime, setEndTime] = useState('18:00')
  const [minBookingMins, setMinBookingMins] = useState('30')
  const [maxBookingMins, setMaxBookingMins] = useState('90')
  const [activeDropdowns, setActiveDropdowns] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({ name: false, code: false })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDropdownToggle = (open: boolean) => {
    setActiveDropdowns(count => Math.max(0, count + (open ? 1 : -1)))
  }

  const openCrop = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setCropSource(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleImageDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) {
      openCrop(file)
      return
    }
    const imageUrl = event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain') || event.dataTransfer.getData('url')
    if (imageUrl.startsWith('http') || imageUrl.startsWith('data:')) setCropSource(imageUrl)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return
    if (step === 1) {
      if (!name.trim() || !code.trim()) {
        setErrors({ name: !name.trim(), code: !code.trim() })
        onNotify(!name.trim() && !code.trim() ? 'Facility name and code are required.' : !name.trim() ? 'Facility name is required.' : 'Facility code is required.', 'error', 'Missing Information')
        return
      }
      const duplicateName = facilities.some(facility => facility.name.trim().toLowerCase() === name.trim().toLowerCase())
      const duplicateCode = facilities.some(facility => facility.code.trim().toLowerCase() === code.trim().toLowerCase())
      if (duplicateName || duplicateCode) {
        setErrors({ name: duplicateName, code: duplicateCode })
        onNotify(duplicateName && duplicateCode ? 'A facility with this name and code already exists.' : duplicateName ? 'A facility with this name already exists.' : 'A facility with this code already exists.', 'warning', 'Duplicate Facility')
        return
      }
    }
    if (!type.trim()) {
      onNotify('Enter or choose a facility type.', 'error', 'Facility Type Required')
      return
    }
    if (step < 3) { setStep(current => current + 1); return }
    if (Number(minBookingMins) >= Number(maxBookingMins)) {
      onNotify('Maximum booking minutes must be greater than minimum booking minutes.', 'warning', 'Invalid Booking Limits')
      return
    }
    if (!startTime || !endTime || startTime >= endTime) {
      onNotify('Start time must be earlier than end time.', 'warning', 'Invalid Schedule Time')
      return
    }

    setIsSubmitting(true)
    let uploadedImageRef: ReturnType<typeof ref> | null = null
    try {
      const facilityRef = doc(collection(db, 'facilities'))
      let imageUrl = DEFAULT_ROOM_IMAGE
      if (imageBlob) {
        uploadedImageRef = ref(storage, `facilities/${facilityRef.id}/image_${Date.now()}`)
        await uploadBytesResumable(uploadedImageRef, imageBlob)
        imageUrl = await getDownloadURL(uploadedImageRef)
      }
      await manageFacility({ action: 'create_facility', targetId: facilityRef.id, data: {
        buildingId, name: name.trim(), code: code.trim(), type: type.trim(),
        floor: parseInt(floor) || 0, capacity: parseInt(capacity) || 0, status, image: imageUrl,
        description: description.trim(), amenities, availableDays, startTime, endTime,
        minBookingMins: Number(minBookingMins), maxBookingMins: Number(maxBookingMins),
      } })
      onSaved(name.trim())
    } catch (error) {
      if (uploadedImageRef) {
        try { await deleteObject(uploadedImageRef) } catch (cleanupError) { console.error('Failed to clean up facility image:', cleanupError) }
      }
      console.error('Error saving facility:', error)
      const message = facilityActionError(error, 'Failed to save facility. Please try again.')
      const unavailableOnServer = error instanceof Error && 'code' in error
        && error.code === 'functions/invalid-argument' && /valid facility action/i.test(error.message)
      onNotify(unavailableOnServer ? 'Facility creation is not available on the server yet. Update the manageFacility function and try again.' : message, 'error', 'Error Saving Facility')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-visible" onClick={event => event.stopPropagation()}>
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Add Facility</h3>
              <p className="mt-1 text-xs text-white/80">Step {step} of 3: {step === 1 ? 'General Info' : step === 2 ? 'Media & Description' : 'Availability & Limits'}</p>
            </div>
            <div className="flex gap-1.5">{[1, 2, 3].map(number => <div key={number} className={`h-1.5 w-6 rounded-full transition-colors ${number <= step ? 'bg-white' : 'bg-white/30'}`} />)}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-visible">
          {step === 1 && <div className="space-y-4 overflow-visible animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-5 gap-4 overflow-visible">
              <div className="col-span-3">
                <div className="flex justify-between items-end mb-2">
                  <label htmlFor="facility-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500">Facility Name <span className="text-rose-500">*</span></label>
                  <span className="text-[0.625rem] font-bold uppercase tracking-tight text-gray-400">{name.length} / 24</span>
                </div>
                <TextInput id="facility-name" value={name} onChange={value => { setName(value); if (errors.name) setErrors(current => ({ ...current, name: false })) }} maxLength={24} placeholder="e.g. Main Auditorium" error={errors.name} autoFocus />
              </div>
              <div className="col-span-2">
                <div className="flex justify-between items-end mb-2">
                  <label htmlFor="facility-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500">Code <span className="text-rose-500">*</span></label>
                  <span className="text-[0.625rem] font-bold uppercase tracking-tight text-gray-400">{code.length} / 8</span>
                </div>
                <TextInput id="facility-code" value={code} onChange={value => { setCode(value); if (errors.code) setErrors(current => ({ ...current, code: false })) }} maxLength={8} placeholder="e.g. AUD-01" error={errors.code} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 overflow-visible">
              <div><label htmlFor="facility-floor" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Floor</label><NumberInput id="facility-floor" value={floor} onChange={setFloor} /></div>
              <div><label htmlFor="facility-capacity" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Capacity</label><NumberInput id="facility-capacity" value={capacity} onChange={setCapacity} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4 overflow-visible">
              <div>
                <label htmlFor="facility-type" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Type <span className="text-rose-500">*</span></label>
                <SingleSelectDropdown options={TYPE_SUGGESTIONS} value={type} onChange={setType} placeholder="Select or enter type" ariaLabel="Facility type" searchable allowCustomValue maxLength={50} showSearchChevron neutralFocus onToggle={handleDropdownToggle} className="w-full" />
              </div>
              <div><label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Status</label><SingleSelectDropdown options={['Available', 'Unavailable', 'Maintenance']} value={status} onChange={value => setStatus(value as RoomStatus)} onToggle={handleDropdownToggle} className="w-full" ariaLabel="Facility status" /></div>
            </div>
          </div>}

          {step === 2 && <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-1 flex flex-col">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Facility Photo</label>
                <input type="file" ref={fileInputRef} onChange={event => { const file = event.target.files?.[0]; if (file) openCrop(file); event.target.value = '' }} accept="image/*" className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()} onDragOver={event => { event.preventDefault(); setIsDragging(true) }} onDragLeave={event => { event.preventDefault(); setIsDragging(false) }} onDrop={handleImageDrop}
                  className={`w-full aspect-square rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition-all group relative shadow-sm ${isDragging ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 ring-4 ring-[var(--brand-color)]/10 scale-[0.98]' : 'border-gray-200 bg-gray-50 hover:border-[var(--brand-color)]'}`}>
                  {image ? <img src={image} alt="Facility preview" className="h-full w-full object-cover" onError={event => { event.currentTarget.src = DEFAULT_ROOM_IMAGE }} /> : <div className="flex flex-col items-center gap-2"><CameraIcon className="h-8 w-8 text-gray-400" /><span className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-tight text-center px-2">Upload Image</span></div>}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"><UploadIcon className="h-8 w-8 text-white" /></div>
                </button>
              </div>
              <div className="col-span-2 flex flex-col">
                <div className="flex justify-between items-end mb-2"><label htmlFor="facility-description" className="block text-xs font-bold uppercase tracking-widest text-gray-500">Description</label><span className="text-[0.625rem] font-bold uppercase tracking-tight text-gray-400">{description.length} / 200</span></div>
                <TextAreaInput id="facility-description" value={description} maxLength={200} onChange={setDescription} placeholder="Describe the facility, equipment, and other details..." className="flex-1" inputClassName="h-full" />
              </div>
            </div>
            <div><label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Facility Amenities</label><RoomAmenities amenities={AMENITIES} selectedAmenities={amenities} onToggleAmenity={amenity => setAmenities(current => current.includes(amenity) ? current.filter(item => item !== amenity) : [...current, amenity])} maxHeightClass="max-h-[7.8rem]" /></div>
          </div>}

          {step === 3 && <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div><label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Available Days</label><div className="flex gap-1.5">{DAYS.map(day => <button key={day} type="button" onClick={() => setAvailableDays(current => current.includes(day) ? current.filter(item => item !== day) : [...current, day])} className={`flex-1 flex flex-col items-center justify-center rounded-xl border py-2 text-[0.625rem] font-bold uppercase transition cursor-pointer ${availableDays.includes(day) ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white shadow-sm' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'}`}>{day.slice(0, 3).split('').map((character, index) => <span key={index} className="leading-tight">{character}</span>)}</button>)}</div></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Start Time</label>
                <TimePicker
                  value={startTime}
                  onChange={value => {
                    setStartTime(value)
                    if (value && endTime) {
                      const [startHour, startMinute] = value.split(':').map(Number)
                      const [endHour, endMinute] = endTime.split(':').map(Number)
                      const startMinutes = (startHour || 0) * 60 + (startMinute || 0)
                      const endMinutes = (endHour || 0) * 60 + (endMinute || 0)
                      if (startMinutes >= endMinutes) {
                        const nextEnd = Math.min(1410, startMinutes + 30)
                        setEndTime(`${Math.floor(nextEnd / 60).toString().padStart(2, '0')}:${(nextEnd % 60).toString().padStart(2, '0')}`)
                      }
                    }
                  }}
                  onToggle={handleDropdownToggle}
                  minuteStep={30}
                  hideClear
                  hourOrder="ascending"
                  minTime="00:00"
                  maxTime={(() => {
                    if (!endTime) return '23:00'
                    const [hour, minute] = endTime.split(':').map(Number)
                    const latest = Math.max(0, (hour || 0) * 60 + (minute || 0) - 30)
                    return `${Math.floor(latest / 60).toString().padStart(2, '0')}:${(latest % 60).toString().padStart(2, '0')}`
                  })()}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">End Time</label>
                <TimePicker
                  value={endTime}
                  onChange={value => {
                    setEndTime(value)
                    if (value && startTime) {
                      const [startHour, startMinute] = startTime.split(':').map(Number)
                      const [endHour, endMinute] = value.split(':').map(Number)
                      const startMinutes = (startHour || 0) * 60 + (startMinute || 0)
                      const endMinutes = (endHour || 0) * 60 + (endMinute || 0)
                      if (endMinutes <= startMinutes) {
                        const nextStart = Math.max(0, endMinutes - 30)
                        setStartTime(`${Math.floor(nextStart / 60).toString().padStart(2, '0')}:${(nextStart % 60).toString().padStart(2, '0')}`)
                      }
                    }
                  }}
                  onToggle={handleDropdownToggle}
                  minuteStep={30}
                  hideClear
                  hourOrder="ascending"
                  defaultPlacement="latest"
                  minTime={(() => {
                    if (!startTime) return '00:30'
                    const [hour, minute] = startTime.split(':').map(Number)
                    const earliest = Math.min(1410, (hour || 0) * 60 + (minute || 0) + 30)
                    return `${Math.floor(earliest / 60).toString().padStart(2, '0')}:${(earliest % 60).toString().padStart(2, '0')}`
                  })()}
                  maxTime="23:30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 overflow-visible">
              <div><label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Min Booking (Mins)</label><SingleSelectDropdown options={BOOKING_OPTIONS} value={minBookingMins} onChange={value => { setMinBookingMins(value); if (parseInt(maxBookingMins) < parseInt(value)) setMaxBookingMins(value) }} onToggle={handleDropdownToggle} className="w-full" /></div>
              <div><label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Max Booking (Mins)</label><SingleSelectDropdown options={BOOKING_OPTIONS.filter(option => parseInt(option) >= parseInt(minBookingMins))} value={maxBookingMins} onChange={setMaxBookingMins} onToggle={handleDropdownToggle} className="w-full" /></div>
            </div>
          </div>}

          <div className="flex items-center gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => step > 1 ? setStep(current => current - 1) : onClose()} disabled={isSubmitting} className="flex-1">{step > 1 ? 'Back' : 'Cancel'}</Button>
            <Button type="submit" variant="brand" disabled={isSubmitting} className="flex-1">{step < 3 ? 'Next Step' : isSubmitting ? 'Adding Facility...' : 'Add Facility'}</Button>
          </div>
        </form>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={() => { if (!isSubmitting && activeDropdowns === 0) onClose() }} />
    </div>
    {cropSource && <CropModal imageSrc={cropSource} onCropComplete={blob => { setImageBlob(blob); setImage(URL.createObjectURL(blob)); setCropSource('') }} onClose={() => setCropSource('')} isUploading={false} title="Adjust Facility Image" hideOverlay={true} cropShape="rect" />}
  </>
}
