export const PLASTIC_TYPES = ['PET Bottles', 'Plastic Containers', 'HDPE Plastic', 'Mixed Plastic']
export const STAGES = ['Submitted', 'Accepted', 'On the way', 'Collected', 'Verified']
export const STATUS_TO_STAGE = { AVAILABLE: 0, ACCEPTED: 1, ON_THE_WAY: 2, COLLECTED: 3, VERIFIED: 4 }
export const STATUS_LABEL = { AVAILABLE: 'Awaiting collector', ACCEPTED: 'Collector assigned', ON_THE_WAY: 'On the way', COLLECTED: 'Collected', VERIFIED: 'Verified' }
export const POINTS_PER_KG = 100
export const PHOTO_BUCKET = 'pickup-photos'
export const REWARDS = [
  { name: 'Free Pickup', cost: 300, note: 'One scheduled pickup' },
  { name: '₦1,000 Airtime', cost: 500, note: 'Mobile airtime reward' },
  { name: '₦2,000 Shopping Voucher', cost: 1000, note: 'Partner voucher' },
]
export const TIERS = [
  { name: 'Bronze', from: 0 },
  { name: 'Silver', from: 10 },
  { name: 'Gold', from: 25 },
  { name: 'Platinum', from: 50 },
]
