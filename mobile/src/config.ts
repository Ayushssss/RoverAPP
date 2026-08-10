const DEV_API_URL = 'http://192.168.0.102:3000';
/*
  Mumbai, on our own EC2 box.

  Every command crosses this host, so its distance is added to every one of
  them. Two moves, each measured from here:

    Render, US-West    ~240ms warm, 22,400ms cold
    Render, Singapore  ~105ms warm, 209ms cold
    EC2, ap-south-1     36ms median, 33-44ms spread

  The last step is bigger than the geography alone accounts for. Render's free
  tier throttles, which showed up as occasional 534ms spikes on an otherwise
  175ms median — and a spike mid-turn is what actually makes a rover feel
  broken. Our own instance has no such behaviour, so the tail collapsed along
  with the median.

  Switching back is one line, and the Render service still runs the same code.
*/
const PROD_API_URL = 'https://roverapp.duckdns.org';

// Set to true when deploying to production
export const IS_PRODUCTION = true;
export const API_URL = IS_PRODUCTION ? PROD_API_URL : DEV_API_URL;
export const WS_URL = API_URL;
