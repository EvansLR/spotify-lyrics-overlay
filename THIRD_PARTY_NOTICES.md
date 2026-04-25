# Third-party notices

## Runtime and build dependencies

This project uses the following npm packages:

| Package | Version used | License | Purpose |
| --- | ---: | --- | --- |
| `electron` | 32.3.3 | MIT | Desktop application runtime |
| `electron-builder` | 25.1.8 | MIT | Windows application packaging |

Transitive npm dependencies are installed from `package-lock.json`. Their license metadata is available in each package under `node_modules` after `npm install`.

## External services

This app calls the following external APIs at runtime:

| Service | Purpose |
| --- | --- |
| Spotify Web API | Reads currently playing track and playback progress after user authorization |
| LRCLIB API | Searches synced/plain lyrics for the currently playing track |

This repository does not vendor Spotify or LRCLIB source code.
