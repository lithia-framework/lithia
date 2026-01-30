import {LithiaRequest, LithiaResponse} from '@lithia-js/core'

export default async (req: LithiaRequest, res: LithiaResponse) => {
  res.json({ message: 'Hello, from Lithia with Docker! 🚀' });
}