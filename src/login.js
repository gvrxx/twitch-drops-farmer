// Sign-in step for Windows, macOS and Linux desktops: opens a normal browser
// window on the app's profile so you can log in to Twitch yourself.
// (Docker does this from the app itself; see TwitchBrowser.signIn.)
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { openSignInBrowser } from './signin.js';

const quit = process.platform === 'darwin' ? 'quit it with Cmd+Q' : 'close the window';
let child;
try {
  child = openSignInBrowser(path.join(DATA_DIR, 'browser-profile'));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
console.log(`Log in to Twitch in the window that opens, then ${quit}.`);
child.on('error', (err) => {
  console.error(`Couldn't open the browser: ${err.message}`);
  process.exit(1);
});
child.on('exit', () => console.log('Done. Now start the app.'));
