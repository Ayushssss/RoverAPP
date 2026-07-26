const DEV_API_URL = 'http://192.168.0.102:3000';
const PROD_API_URL = 'https://roverapp.onrender.com';

// Set to true when deploying to production
export const IS_PRODUCTION = true;
export const API_URL = IS_PRODUCTION ? PROD_API_URL : DEV_API_URL;
export const WS_URL = API_URL;
