import type { PointsRewardDetails } from '../../tprs/schemas';

export function pointsRewardMessage(details: PointsRewardDetails): string {
  switch(details.reason) {
    case 'insufficient_points': return details.pointBalance !== undefined && details.requiredPoints !== undefined
      ? `This reward’s account has ${details.pointBalance} points. ${details.requiredPoints} points are required.`
      : 'The account that earned this reward does not currently have enough points.';
    case 'phone_mismatch': return 'Use the phone number associated with this reward, or remove the reward to continue.';
    case 'reward_used': return 'This reward link has already been used.';
    case 'reward_unavailable': return 'This reward is not available right now.';
    case 'payment_reward_mismatch': return 'The reward changed during checkout. This booking could not be completed.';
    case 'payment_recovery_required': return 'This payment cannot be used to complete a reservation.';
    default: return 'This reward could not be applied.';
  }
}

export function pointsRecoveryMessage(status: PointsRewardDetails['refundStatus']): string {
  switch(status) {
    case 'requested': return 'Your reservation was not completed. A refund has been requested. Please start a new booking, or call (815) 782-7790.';
    case 'succeeded': return 'Your reservation was not completed. The payment provider has confirmed the refund. Please start a new booking, or call (815) 782-7790.';
    case 'awaiting_payment': return 'Your reservation was not completed. Your payment is still processing. Please call (815) 782-7790 before trying another payment.';
    case 'failed': return 'Your reservation was not completed, and the refund failed. Please call (815) 782-7790 before trying another payment.';
    default: return 'We could not confirm the payment or refund outcome. Please call (815) 782-7790 before trying another payment.';
  }
}
