const DEV_API_URL = 'http://192.168.0.102:3000';
/*
  Singapore, not Oregon.

  The original service sat in Render's US-West region, which put roughly
  300ms of Pacific crossing between a phone and a rover standing in the same
  room. Measured from here: 22,400ms cold / ~240ms warm to Oregon, against
  209ms cold / ~105ms warm to Singapore.

  The old host still exists and still runs the same code — switch back by
  changing this one line if the new service ever misbehaves.
*/
const PROD_API_URL = 'https://roverapp-3b7v.onrender.com';

// Set to true when deploying to production
export const IS_PRODUCTION = true;
export const API_URL = IS_PRODUCTION ? PROD_API_URL : DEV_API_URL;
export const WS_URL = API_URL;
