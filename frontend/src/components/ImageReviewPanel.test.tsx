import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import ImageReviewPanel from './ImageReviewPanel'
import type { CaseImage } from '@/lib/types'

afterEach(cleanup)

const probabilities = {
  normal: 0.1,
  endometrial_cancer: 0.2,
  polyp: 0.7,
}

const images: CaseImage[] = [
  {
    image_id: 'image-1',
    sequence: 1,
    image_url: '',
    original_url: '',
    image_format: 'png',
    original_filename: 'first.png',
    per_image_prediction: {
      image_id: 'image-1',
      predicted_class: 'normal',
      predicted_class_zh: '正常',
      confidence: 0.8,
      probabilities: { ...probabilities, normal: 0.8, polyp: 0 },
      gradcam_url: '',
      model_version: 'v1',
      inference_ms: 1000,
    },
  },
  {
    image_id: 'image-2',
    sequence: 2,
    image_url: '',
    original_url: '',
    image_format: 'png',
    original_filename: 'second.png',
    per_image_prediction: {
      image_id: 'image-2',
      predicted_class: 'polyp',
      predicted_class_zh: '息肉',
      confidence: 0.7,
      probabilities,
      gradcam_url: '',
      model_version: 'v2',
      inference_ms: 1200,
    },
  },
]

describe('ImageReviewPanel', () => {
  it('defaults to the first image and switches image, heatmap, and prediction together', async () => {
    const user = userEvent.setup()
    render(<ImageReviewPanel images={images} />)

    expect(screen.getByRole('img', { name: '原图 1' })).toHaveAttribute(
      'src',
      '/api/images/image-1',
    )
    expect(screen.getByRole('img', { name: 'Grad-CAM 1' })).toHaveAttribute(
      'src',
      '/api/images/image-1/gradcam',
    )
    expect(screen.getByText('正常')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '查看第 2 张图像' }))

    expect(screen.getByRole('img', { name: '原图 2' })).toHaveAttribute(
      'src',
      '/api/images/image-2',
    )
    expect(screen.getByRole('img', { name: 'Grad-CAM 2' })).toHaveAttribute(
      'src',
      '/api/images/image-2/gradcam',
    )
    expect(screen.getAllByText('息肉').length).toBeGreaterThan(0)
    expect(screen.getByText(/v2/)).toBeVisible()
  })

  it('shows stable explicit placeholders when there are no images or no heatmap', () => {
    const { rerender } = render(<ImageReviewPanel images={[]} />)

    expect(screen.getByText('暂无影像')).toBeVisible()
    expect(screen.getByText('暂无影像')).toHaveClass('aspect-[4/3]')

    rerender(
      <ImageReviewPanel images={[{ ...images[0], per_image_prediction: null }]} />,
    )

    expect(screen.getByText('暂无热图')).toBeVisible()
    expect(screen.getByText('暂无热图')).toHaveClass('aspect-[4/3]')
  })

  it('keeps the image frame stable when an image fails to load', () => {
    render(<ImageReviewPanel images={images} />)

    fireEvent.error(screen.getByRole('img', { name: '原图 1' }))

    const placeholder = screen.getByText('原图加载失败')
    expect(placeholder).toBeVisible()
    expect(placeholder).toHaveClass('aspect-[4/3]')
  })
})
