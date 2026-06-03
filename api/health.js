import { json } from '../lib/http.js';

export default function handler(req, res) {
  json(res, { ok: true, service: 'pds-vp-activation' });
}
