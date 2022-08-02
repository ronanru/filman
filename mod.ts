#!/bin/env -S deno run --unstable --allow-read --allow-write --allow-env --allow-run
/*
  Deno Terminal File Manager
  Copyright (C) 2022  Matvey Ryabchikov

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { getFileIcon, getFolderIcon } from './icons.ts';

const decoder = new TextDecoder(),
  print = (str: string) => Deno.writeSync(Deno.stdout.rid, new TextEncoder().encode(str)),
  repeat = (char: string, count: number) => new Array(count).fill(char).join(''),
  render = () => {
    const { rows, columns } = Deno.consoleSize(Deno.stdout.rid);
    if (overlay) {
      print(
        `${repeat(' ', columns)}\n${overlay[0]}: ${overlay[1]}${new Array(rows - 2)
          .fill('\n')
          .join('')}`
      );
      return;
    }
    files = [...Deno.readDirSync(folder || '/')]
      .sort((a, b) => (a.name < b.name ? 1 : -1))
      .sort(({ isFile }) => (isFile ? 1 : -1));
    if (selectedFile - rows + 2 > top) top = selectedFile - rows + 2;
    else if (selectedFile < top) top = selectedFile;
    print(
      `\x1b[30;107;1m ${folder}/${repeat(' ', columns - folder.length - 2)}\x1b[0m` +
        files
          .map(
            ({ name, isDirectory, isFile }, i) =>
              `${selectedFile === i ? '\x1b[30;107;1m' : ''} ${
                isFile ? getFileIcon(name) : getFolderIcon(name)
              } ${name}${isDirectory ? '/' : ''} \x1b[0m${repeat(
                ' ',
                columns - name.length - 4 - (isDirectory ? 1 : 0)
              )}`
          )
          .slice(top, rows + top - 1)
          .join('\n') +
        (rows - 1 > files.length ? repeat('\n', rows - 1 - files.length) : '')
    );
  },
  open = () => {
    if (files[selectedFile].isFile) {
      Deno.run({
        cmd: ['xdg-open', `${folder}/${files[selectedFile].name}`],
        stdout: 'null',
        stderr: 'null',
        stdin: 'null'
      });
      return;
    }
    folder += `/${files[selectedFile].name}`;
    top = 0;
    selectedFile = 0;
  },
  down = () => (selectedFile = Math.min(files.length - 1, selectedFile + 1)),
  up = () => (selectedFile = Math.max(0, selectedFile - 1));

let folder = Deno.env.get('HOME') as string, // path to current folder
  files: Deno.DirEntry[] = [],
  selectedFile = 0,
  top = 0,
  overlay: [string, string, (string: string) => void] | null = null;

Deno.setRaw(Deno.stdin.rid, true, { cbreak: true });
print('\x1b[?25l\x1b[?1049h\x1b[0;0r\x1b[?1000h\x1b[?1002h\x1b[?1005h\x1b[?1006h'); // Disable default handling

onunload = () => print('\x1b[?1049l\x1b[?25h\x1b[?1000l\x1b[?1002l\x1b[?1005l\x1b[?1006l'); // Enable default handling on exit

render();

while (true) {
  const buffer = new Uint8Array(128);
  await Deno.stdin.read(buffer);
  if ([3, 17].includes(buffer[0])) Deno.exit();
  const decoded = decoder.decode(buffer);
  (decoded.split('\x1b').length > 1
    ? // deno-lint-ignore no-control-regex
      decoded.split(/(?=\x1b)/)
    : decoded.length > 1 && !decoded.includes('\x1b')
    ? decoded.split('')
    : [decoded]
  )
    .map(key => key.replaceAll('\x1b', '').replaceAll('\x00', ''))
    .forEach(key => {
      if (!key) return;
      if (key.startsWith('[<') && key.at(-1)?.toLowerCase() === 'm' /* is mouse event */) {
        if (overlay || key.at(-1) === 'm') return;
        const [action, x, y] = key
          .slice(2, -1)
          .split(';')
          .map(c => Number(c));
        switch (action) {
          case 65: // Scroll down
            down();
            break;
          case 64: // Scroll up
            up();
            break;
          case 0: //click
            if (selectedFile === y - 2 + top) return open();
            files[y - 2 + top] && (selectedFile = y - 2 + top);
            break;
        }
        return;
      }
      if (overlay) {
        switch (key) {
          case '\r': // Enter
            overlay[2](overlay[1]);
            overlay = null;
            break;
          case '\b': // Backspace
            overlay[1] = overlay[1].slice(0, -1);
            break;
          default:
            overlay[1] += decoder.decode(buffer);
            break;
        }
        render();
        return;
      }
      switch (key) {
        case '[B': // Arrow Down
          down();
          break;
        case '[A': // Arrow Up
          up();
          break;
        case '[D': // Arrow Left
          if (folder === '/') break;
          folder = folder.slice(0, -1).split('/').slice(0, -1).join('/');
          top = 0;
          selectedFile = 0;
          break;
        case '\r': // Enter
          open();
          break;
        case '\x20': // Ctrl + t
          Deno.run({
            cmd: [Deno.env.get('SHELL') as string],
            cwd: folder
          });
          break;
        case '[3~': // Delete
        case '\x04': // Ctrl + d
        case '\x18': // Ctrl + r
          overlay = [
            `Do you want to delete ${files[selectedFile].name}? [y,N]`,
            '',
            answer =>
              answer.toLowerCase() === 'y' &&
              Deno.removeSync(`${folder}/${files[selectedFile].name}`, { recursive: true })
          ];
          break;
        default: {
          // console.log(key);
          const filteredFiles = files
            .map((file, i) => ({ ...file, i }))
            .filter(({ name }) => name.toLowerCase().startsWith(key.toLowerCase()));
          if (filteredFiles.length)
            selectedFile =
              filteredFiles[
                (filteredFiles.findIndex(({ i }) => i === selectedFile) + 1) % filteredFiles.length
              ].i;
        }
      }
    });
  render();
}
