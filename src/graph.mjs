//
// Graph helper module, far more lightweight than the massive Graph SDK
// -------------------------------------------------------------------------
// Ben C - Sept 2022
//

import axios from 'axios'

export async function getUserDetails(accessToken) {
  if (!accessToken) {
    console.log('No access token provided to getUserDetails');
    return null;
  }
  try {
    const graphReq = {
      url: 'https://graph.microsoft.com/v1.0/me',
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      },
    }
    const resp = await axios(graphReq)
    return resp.data
  } catch (err) {
    console.log(`### 💥 ERROR! Failed to get user details ${err.toString()}`)
    return null;
  }
}

export async function getUserPhoto(accessToken) {
  if (!accessToken) {
    console.log('No access token provided to getUserPhoto');
    return null;
  }
  try {
    const graphReq = {
      url: 'https://graph.microsoft.com/v1.0/me/photo/$value',
      responseType: 'arraybuffer',
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      },
    }
    const resp = await axios(graphReq)
    return new Buffer.from(resp.data, 'binary').toString('base64')
  } catch (err) {
    console.log(`### 💥 ERROR! Failed to get user photo ${err.toString()}`)
    return null;
  }
}
