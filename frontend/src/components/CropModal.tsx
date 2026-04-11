import { useState, useCallback } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { SpinnerIcon } from './Icons'
import { joinClasses } from './IconButton'

// Helper to create a cropped image
export const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve) => (image.onload = resolve))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('No 2d context')
  }

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

interface CropModalProps {
  imageSrc: string
  onCropComplete: (croppedImage: Blob) => void
  onClose: () => void
  isUploading: boolean
  title?: string
  description?: string
  hideOverlay?: boolean
}

export function CropModal({ 
  imageSrc, 
  onCropComplete, 
  onClose, 
  isUploading,
  title = "Adjust Picture",
  description = "Drag to re-position and use the slider to zoom.",
  hideOverlay = false
}: CropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const onCropChange = (crop: Point) => {
    setCrop(crop)
  }

  const onZoomChange = (zoom: number) => {
    setZoom(zoom)
  }

  const onCropCompleteInternal = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    setIsProcessing(true)
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels)
      await onCropComplete(croppedImage)
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  const isLoading = isUploading || isProcessing

  return (
    <div className={joinClasses("fixed inset-0 z-[110] flex items-center justify-center p-4", !hideOverlay && "bg-black/50")}>
      <div 
        className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 dark:border-secondary-800 dark:bg-secondary-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md relative">
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 text-sm text-white/80">{description}</p>
        </div>
        
        <div className={joinClasses("relative h-80 w-full bg-secondary-50 dark:bg-secondary-950", isLoading && "pointer-events-none")}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteInternal}
            onZoomChange={onZoomChange}
          />
        </div>

        <div className="p-6">
          <div className="mb-6">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-secondary-500 dark:text-secondary-400">
              Zoom Level
            </label>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              disabled={isLoading}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-secondary-200 dark:bg-secondary-700 accent-[var(--brand-color)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-300 dark:hover:bg-secondary-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <SpinnerIcon className="h-4 w-4" />
                  <span>Applying...</span>
                </div>
              ) : (
                'Apply Changes'
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={() => !isLoading && onClose()} />
    </div>
  )
}
