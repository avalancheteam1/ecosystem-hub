import { expect, test } from 'vitest'
import { videoPreview } from '@/lib/demo-video'

test('[US-12.2] preserves Vimeo unlisted access hashes in the local preview link', () => {
  expect(videoPreview('https://player.vimeo.com/video/123456789?h=abc123def&autoplay=1')?.url).toBe('https://vimeo.com/123456789/abc123def')
  expect(videoPreview('https://vimeo.com/123456789/abc123def')?.url).toBe('https://vimeo.com/123456789/abc123def')
})
test('[US-12.2] Vimeo preview drops unrelated and invalid hash query values', () => {
  expect(videoPreview('https://player.vimeo.com/video/123456789?h=%3Cinvalid%3E&autoplay=1')?.url).toBe('https://vimeo.com/123456789')
})
