/** Response of GET /api/health - also how the web app learns the kitchen's time zone. */
export interface HealthResponse {
  status: 'ok';
  /** Server time as an ISO instant (UTC). */
  time: string;
  kitchen: {
    /** IANA zone the kitchen runs in, e.g. "Asia/Kolkata". */
    timeZone: string;
    /** Today's date in the kitchen, YYYY-MM-DD. */
    today: string;
    /** Current kitchen time, HH:mm. */
    localTime: string;
  };
}
