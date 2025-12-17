import type { LithiaRequest, LithiaResponse } from 'lithia';

export default async function handler(req: LithiaRequest, res: LithiaResponse) {
  // Your route logic here
  res.send('Hello from your new route!');
}
