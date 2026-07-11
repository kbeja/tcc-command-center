const { YoutubeTranscript } = require('youtube-transcript');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { videoId } = event.queryStringParameters || {};
  if (!videoId) {
    return { statusCode: 400, body: 'Missing videoId parameter' };
  }

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    const text = transcript.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) {
      return { statusCode: 404, body: 'No transcript available for this video.' };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    };
  } catch {
    return { statusCode: 404, body: 'No transcript available for this video.' };
  }
};
