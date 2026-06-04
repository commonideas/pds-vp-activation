import { renderStatusPage } from '../lib/status-page.js';

export default function handler(req, res) {
  renderStatusPage(res, 'Panier des Sens — VP activation');
}
