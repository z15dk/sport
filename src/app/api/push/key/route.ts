import { pushPublicKey } from '../../../../lib/push'

/** The public key browsers need to subscribe to goal alerts */
export function GET() {
  return Response.json({ key: pushPublicKey() })
}
