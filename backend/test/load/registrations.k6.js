import http from 'k6/http';
import {check, sleep} from 'k6';

// Read-only smoke load. Run only against an explicitly authorized environment.
export const options = {vus: 3, duration: '10s', thresholds: {http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000']}};
export default function () {
  const response = http.get(`${__ENV.BASE_URL || 'http://localhost:3001'}/api/health/live`);
  check(response, {'liveness healthy': r => r.status === 200});
  sleep(0.5);
}
