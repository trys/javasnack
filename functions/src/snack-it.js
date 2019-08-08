const { URLSearchParams } = require('url');
const Octokit = require('@octokit/rest');
const { postTemplate } = require('./snack-it-template');

const owner = 'trys';
const repo = 'javasnack';

const github = Octokit({
  auth: process.env.GITHUB_TOKEN,
});

exports.handler = async event => {
  const { headers, httpMethod: method, body } = event;

  if (method !== 'POST') {
    return {
      statusCode: 501,
      body: 'Nothing to see here...',
    };
  }

  try {
    // The message comes in from Slack as a urlencoded string, so parse it
    const parameters = new URLSearchParams(body);

    const data = JSON.parse(parameters.get('payload'));

    if (data.message.type !== 'message') {
      throw new Error('Payload must be a message');
    }

    if (data.channel.name !== 'javasnack') {
      throw new Error('We can only process entries from #javasnack');
    }

    // Parse the review text, remove all `*` characters
    const review = parseReview(data.message.text.replace(new RegExp('[*]', 'g'), ''));

    // Generate the post template with the review object
    const post = generateTemplate(review);

    // Publish it to GitHub
    await createPost(review.title, post);

    return {
      statusCode: 200,
      body: 'Snacked!',
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 400,
      body: e.toString(),
    };
  }
};

/**
 * String replaces placeholders with the correct data
 * @param {Object} review - the review object
 * @returns {String} - the review HTML
 */
function generateTemplate(review) {
  const { title, taste, presentation, vfm, tasteBody, presentationBody, vfmBody } = review;
  const template = postTemplate;

  return template
    .replace('##TITLE##', title)
    .replace('##TASTESCORE##', taste)
    .replace('##PRESENTSCORE##', presentation)
    .replace('##VFMSCORE##', vfm)
    .replace('##TASTEBODY##', tasteBody)
    .replace('##PRESENTBODY##', presentationBody)
    .replace('##VFMBODY##', vfmBody);
}

/**
 * Performs a somewhat hacky parse of the review text from Slack
 * and converts it into a data object with what we need for a post.
 * @param {String} review - the review text from Slack
 * @returns {Object} - the review object
 */
function parseReview(review) {
  // dodgily get title
  const title = review.split('\n')[0];

  // dodgily pull scores out
  const scores = {};
  for (const score of [
    { key: 'taste', searchString: 'taste: ' },
    { key: 'presentation', searchString: 'presentation: ' },
    { key: 'vfm', searchString: 'value for money: ' },
  ]) {
    const searchPos = review.search(new RegExp(score.searchString, 'i'));

    if (searchPos > -1) {
      const keyPosition = searchPos + score.searchString.length;

      scores[score.key] = Number(review.substring(keyPosition, keyPosition + 2));
    }
  }

  // Get paragraphs
  const paragraphs = review.split('\n');
  // Find the heading, +1 the index to get the following paragraph
  const tasteBody = paragraphs[paragraphs.findIndex(p => p === 'Taste') + 1];
  const presentationBody = paragraphs[paragraphs.findIndex(p => p === 'Presentation') + 1];
  const vfmBody = paragraphs[paragraphs.findIndex(p => p === 'Value for Money') + 1];

  return { title, ...scores, tasteBody, presentationBody, vfmBody };
}

/**
 * Does a bunch of GitHub API calls to get our generated
 * Sergey template into the GitHub repo.
 * @param {String} title - the title of the post
 * @param {String} post - the post HTML generated from generateTemplate()
 * @returns {Promise<UpdateRef>}
 */
async function createPost(title, post) {
  const branch = await github.gitdata.getRef({
    owner,
    repo,
    ref: 'heads/master',
  });

  const tree = await github.git.createTree({
    owner,
    repo,
    tree: [
      {
        path: `${title
          .toLowerCase()
          .split(' ')
          .join('-')}/index.html`,
        mode: '100644',
        type: 'blob',
        content: post,
      },
    ],
    base_tree: branch.data.object.sha,
  });

  const commit = await github.git.createCommit({
    owner,
    repo,
    message: `New JavaSnack!`,
    tree: tree.data.sha,
    parents: [branch.data.object.sha],
  });

  return await github.git.updateRef({
    owner,
    repo,
    ref: 'heads/master',
    sha: commit.data.sha,
    force: true,
  });
}
