import React from 'react'

export interface RoomAmenitiesProps {
  amenities: string[]
  selectedAmenities?: string[]
  onToggleAmenity?: (amenity: string) => void
  maxHeightClass?: string
  emptyMessage?: string
}

export function RoomAmenities({ 
  amenities, 
  selectedAmenities, 
  onToggleAmenity, 
  maxHeightClass = 'max-h-[7.8rem]',
  emptyMessage = 'No amenities available'
}: RoomAmenitiesProps) {
  const isInteractive = onToggleAmenity !== undefined

  return (
    <div className={`flex flex-wrap gap-1.5 ${maxHeightClass} overflow-y-auto custom-scrollbar pr-1 pb-1`}>
      {amenities.length > 0 ? (
        amenities.map((amenity) => {
          const isSelected = selectedAmenities?.includes(amenity)
          
          return (
            <button
              key={amenity}
              type="button"
              disabled={!isInteractive}
              onClick={() => isInteractive && onToggleAmenity(amenity)}
              className={`flex-1 min-w-[fit-content] h-9 flex items-center justify-center gap-1 rounded-xl border px-3 text-sm font-bold shadow-sm whitespace-nowrap transition-colors ${
                isSelected 
                  ? 'bg-[var(--brand-color)] border-[var(--brand-color)] text-white' 
                  : isInteractive
                    ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                    : 'bg-gray-100 border-gray-200 text-gray-600'
              } ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {amenity}
            </button>
          )
        })
      ) : (
        <p className="text-sm italic text-gray-400">{emptyMessage}</p>
      )}
    </div>
  )
}
