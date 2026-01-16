const axios = require('axios');

const getZoomAccessToken = async () => {
  const token = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    'https://zoom.us/oauth/token',
    null,
    {
      params: {
        grant_type: 'account_credentials',
        account_id: process.env.ZOOM_ACCOUNT_ID
      },
      headers: {
        Authorization: `Basic ${token}`
      }
    }
  );

  return response.data.access_token;
};

const createZoomMeeting = async ({ topic, startTime, duration }) => {
  const accessToken = await getZoomAccessToken();

  const response = await axios.post(
    'https://api.zoom.us/v2/users/me/meetings',
    {
      topic,
      type: 2, // scheduled
      start_time: startTime,
      duration,
      timezone: 'Asia/Kolkata',
      settings: {
        join_before_host: false,
        waiting_room: true
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return response.data;
};

module.exports = {
  createZoomMeeting
};
