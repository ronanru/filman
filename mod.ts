#!/bin/env -S deno run --unstable --allow-all

/*
This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { getFileIcon, getFolderIcon } from './icons.ts';

const print = (str: string) => Deno.writeSync(Deno.stdout.rid, new TextEncoder().encode(str));

let folder = Deno.env.get('HOME') as string, // path to current folder
  files: Deno.DirEntry[] = [],
  selectedFile = 0,
  top = 0;

Deno.setRaw(Deno.stdin.rid, true);
print('\x1b[?1049h\x1b[0;0r\x1b[?25l'); // Save terminal and Hide cursor

onunload = () => print('\x1b[?1049l\x1b[?25h'); // Load saved terminal and Show cursor

const renderFrame = () => {
  files = [...Deno.readDirSync(folder)]
    .sort((a, b) => (a.name < b.name ? 1 : -1))
    .sort(({ isFile }) => (isFile ? 1 : -1));
  const { rows, columns } = Deno.consoleSize(Deno.stdout.rid);
  if (top > rows) top = 0;
  while (selectedFile >= top + rows - 1) top++;
  while (selectedFile < top) top--;
  print(
    `\x1b[30;107;1m ${folder}/${new Array(columns - folder.length - 2).fill(' ').join('')}\x1b[0m` +
      files
        .map(
          ({ name, isDirectory, isFile }, i) =>
            `${selectedFile === i ? '\x1b[30;107;1m' : ''} ${
              isFile ? getFileIcon(name) : getFolderIcon(name)
            } ${name}${isDirectory ? '/' : ''} \x1b[0m${new Array(
              columns - name.length - 4 - (isDirectory ? 1 : 0)
            )
              .fill(' ')
              .join('')}`
        )
        .slice(top, rows + top - 1)
        .join('\n') +
      (rows - 1 > files.length ? new Array(rows - 1 - files.length).fill('\n').join('') : '')
  );
};

renderFrame();

while (true) {
  const buffer = new Uint8Array(1);
  await Deno.stdin.read(buffer);
  switch (buffer[0]) {
    case 3: // Ctrl + C
    case 17: // Ctrl + q
      Deno.exit();
      break;
    case 66: // Arrow Down
      // top++;
      selectedFile = Math.min(files.length - 1, selectedFile + 1);
      renderFrame();
      break;
    case 65: // Arrow Top
      selectedFile = Math.max(0, selectedFile - 1);
      renderFrame();
      break;
    case 68: // Arrow Left
      if (folder === '/') break;
      folder = folder.slice(0, -1).split('/').slice(0, -1).join('/');
      top = 0;
      selectedFile = 0;
      renderFrame();
      break;
    case 13: // Enter
      if (files[selectedFile].isFile) {
        Deno.run({
          cmd: ['xdg-open', `${folder}/${files[selectedFile].name}`],
          stdout: 'null',
          stderr: 'null',
          stdin: 'null'
        });
        break;
      }
      folder += `/${files[selectedFile].name}`;
      top = 0;
      selectedFile = 0;
      renderFrame();
      break;
    case 20: // Ctrl + t
      Deno.run({
        cmd: [Deno.env.get('SHELL') as string],
        cwd: folder
      });
      break;
    default: {
      const filteredFiles = files
        .map((file, i) => ({ ...file, i }))
        .filter(({ name }) =>
          name.toLowerCase().startsWith(new TextDecoder().decode(buffer).toLowerCase())
        );
      if (filteredFiles.length)
        selectedFile =
          filteredFiles[
            (filteredFiles.findIndex(({ i }) => i === selectedFile) + 1) % filteredFiles.length
          ].i;
      renderFrame();
      // console.log(`\x1b[2J${buffer}`);
    }
  }
}
