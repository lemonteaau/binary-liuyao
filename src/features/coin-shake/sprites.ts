import coinFacesUrl from '@/assets/coin-faces.webp'

/** 原图中两枚铜钱的圆心（px）与裁切半径；币面半径约 392px */
const FACE_CENTERS = {
  heads: { x: 451.5, y: 436 },
  tails: { x: 1318.5, y: 436 },
} as const
const CROP_HALF = 432
const LEVEL_SIZES = [512, 256, 128] as const
const SHADOW_SIZE = 192
const SHADOW_BOX = 128
const SHADOW_BLURS = [1.5, 7, 16] as const

/** 币面半径与贴图半边长之比 */
export const COIN_RATIO = 392 / CROP_HALF
/** 方孔半边长与币面半径之比 */
export const HOLE_RATIO = 0.205

type Sprite = HTMLCanvasElement | ImageBitmap

export interface CoinSprites {
  /** 各级贴图，边长依次为 sizes；绘制时须显式指定尺寸 */
  heads: Sprite[]
  tails: Sprite[]
  sizes: readonly number[]
  /** 不同模糊程度的投影，币面半径为 shadowRadius */
  shadows: HTMLCanvasElement[]
  shadowSize: number
  shadowRadius: number
}

let pending: Promise<CoinSprites> | null = null

export function loadCoinSprites(): Promise<CoinSprites> {
  if (!pending) {
    pending = buildSprites()
    pending.catch(() => {
      pending = null
    })
  }
  return pending
}

/** 让出主线程，避免贴图准备拼成一个长任务 */
const yieldToBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas unavailable')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  return [canvas, context]
}

/** 优先在解码线程完成裁切与缩放；不支持时退回 canvas 逐级减半 */
async function faceLevels(source: ImageBitmap | HTMLImageElement, center: { x: number; y: number }) {
  const x = center.x - CROP_HALF
  const y = center.y - CROP_HALF
  const side = CROP_HALF * 2
  try {
    return await Promise.all(
      LEVEL_SIZES.map((size) =>
        createImageBitmap(source, x, y, side, side, {
          resizeWidth: size,
          resizeHeight: size,
          resizeQuality: 'high',
        }),
      ),
    )
  } catch {
    const levels: HTMLCanvasElement[] = []
    for (const size of LEVEL_SIZES) {
      const [canvas, context] = canvasOf(size)
      const previous = levels[levels.length - 1]
      if (previous) context.drawImage(previous, 0, 0, size, size)
      else context.drawImage(source, x, y, side, side, 0, 0, size, size)
      levels.push(canvas)
      await yieldToBrowser()
    }
    return levels
  }
}

async function decode(): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const response = await fetch(coinFacesUrl)
      if (response.ok) return await createImageBitmap(await response.blob())
    } catch {
      /* 退回到 <img> 解码 */
    }
  }
  const image = new Image()
  image.decoding = 'async'
  image.src = coinFacesUrl
  await image.decode()
  return image
}

function blurredShadow(silhouette: HTMLCanvasElement, blur: number): HTMLCanvasElement {
  const [canvas, context] = canvasOf(SHADOW_SIZE)
  const inset = (SHADOW_SIZE - SHADOW_BOX) / 2
  // 把图形画到画布外，只让 shadowBlur 产生的模糊影子落进来：各浏览器都支持
  context.shadowColor = '#000'
  context.shadowBlur = blur
  context.shadowOffsetX = SHADOW_SIZE * 2
  context.drawImage(silhouette, inset - SHADOW_SIZE * 2, inset, SHADOW_BOX, SHADOW_BOX)
  return canvas
}

async function buildSprites(): Promise<CoinSprites> {
  const source = await decode()
  const [heads, tails] = await Promise.all([
    faceLevels(source, FACE_CENTERS.heads),
    faceLevels(source, FACE_CENTERS.tails),
  ])
  if ('close' in source) source.close()

  const [silhouette, context] = canvasOf(SHADOW_BOX)
  context.drawImage(heads[2]!, 0, 0, SHADOW_BOX, SHADOW_BOX)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = '#000'
  context.fillRect(0, 0, SHADOW_BOX, SHADOW_BOX)
  const shadows: HTMLCanvasElement[] = []
  for (const blur of SHADOW_BLURS) {
    await yieldToBrowser()
    shadows.push(blurredShadow(silhouette, blur))
  }

  return {
    heads,
    tails,
    sizes: LEVEL_SIZES,
    shadows,
    shadowSize: SHADOW_SIZE,
    shadowRadius: (SHADOW_BOX / 2) * COIN_RATIO,
  }
}
