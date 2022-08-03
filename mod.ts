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
  selectedFiles = new Set<string>(),
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
    if (highlightedFile - rows + 2 > top) top = highlightedFile - rows + 2;
    else if (highlightedFile < top) top = highlightedFile;
    print(
      `\x1b[30;107;1m ${folder}/${repeat(
        ' ',
        columns - folder.length - 24
      )}|   CODE  |   GUI   \x1b[0m` +
        files
          .map(
            ({ name, isDirectory, isFile }, i) =>
              `${highlightedFile === i ? '\x1b[30;107;1m' : ''} ${
                selectedFiles.has(name) ? '⬤' : ' '
              } ${isFile ? getFileIcon(name) : getFolderIcon(name)} ${name}${
                isDirectory ? '/' : ''
              } \x1b[0m${repeat(' ', columns - name.length - 6 - (isDirectory ? 1 : 0))}`
          )
          .slice(top, rows + top - 1)
          .join('\n') +
        (rows - 1 > files.length ? repeat('\n', rows - 1 - files.length) : '')
    );
  },
  open = () => {
    if (files[highlightedFile].isFile) {
      Deno.run({
        cmd: ['xdg-open', `${folder}/${files[highlightedFile].name}`],
        stdout: 'null',
        stderr: 'null',
        stdin: 'null'
      });
      return;
    }
    folder += `/${files[highlightedFile].name}`;
    top = 0;
    highlightedFile = 0;
    selectedFiles.clear();
  },
  down = () => (highlightedFile = Math.min(files.length - 1, highlightedFile + 1)),
  up = () => (highlightedFile = Math.max(0, highlightedFile - 1)),
  exit = () => {
    print('\x1b[?1049l\x1b[?25h\x1b[?1000l\x1b[?1002l\x1b[?1005l\x1b[?1006l'); // Enable default handling on exit;
    Deno.exit();
  };

let folder = Deno.env.get('HOME') as string, // path to current folder
  files: Deno.DirEntry[] = [],
  highlightedFile = 0,
  top = 0,
  overlay: [string, string, (string: string) => void] | null = null;

Deno.setRaw(Deno.stdin.rid, true);
print('\x1b[?25l\x1b[?1049h\x1b[0;0r\x1b[?1000h\x1b[?1002h\x1b[?1005h\x1b[?1006h'); // Disable default handling

onunload = exit;

Deno.addSignalListener('SIGINT', exit);
Deno.addSignalListener('SIGTERM', exit);
Deno.addSignalListener('SIGWINCH', render); // on resize;

render();

while (true) {
  const buffer = new Uint8Array(2048);
  await Deno.stdin.read(buffer);
  if ([17].includes(buffer[0])) exit();
  const decoded = decoder.decode(buffer);
  (decoded.split('\x1b').length > 1
    ? // deno-lint-ignore no-control-regex
      decoded.split(/(?=\x1b)/)
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
          // case 32: // drag
          // if (files[y - 2 + top]) selectedFiles.add(files[y - 2 + top].name);
          // break;
          case 0: //click
            if (y === 1) {
              const { columns } = Deno.consoleSize(Deno.stdout.rid);
              if (columns - x < 10 && columns - x > 1)
                Deno.run({
                  cmd: ['/bin/xdg-open', '.'],
                  cwd: folder,
                  stdout: 'null'
                });
              else if (columns - x < 20 && columns - x > 12)
                Deno.run({
                  cmd: ['/bin/codium', '.'],
                  cwd: folder
                });
              break;
            }
            if (highlightedFile === y - 2 + top) return open();
            if (files[y - 2 + top]) highlightedFile = y - 2 + top;
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
          case '\x7f': // Backspace
            overlay[1] = overlay[1].slice(0, -1);
            break;
          default:
            overlay[1] += key;
            break;
        }
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
          highlightedFile = 0;
          break;
        case '\r': // Enter
          open();
          break;
        // case '\x14': // Ctrl + t
        // TODO: Fix

        // Deno.run({
        //   cmd: ['/bin/sh', '-c', `". ${Deno.env.get('SHELL')}"`],
        //   cwd: folder,
        //   stdin: 'inherit',
        //   stdout: 'inherit'
        // });
        // break;
        case '\x03':
          if (!selectedFiles.size) selectedFiles.add(files[highlightedFile].name);
          Deno.run({
            cmd: [
              '/bin/sh',
              '-c',
              `echo "${[...selectedFiles]
                .map(file => `file://${folder}/${file}`)
                .join('\n')}" | xclip -selection clipboard -t text/uri-list`
            ],
            cwd: folder
          });
          selectedFiles.clear();
          break;
        case ' ':
          selectedFiles[selectedFiles.has(files[highlightedFile].name) ? 'delete' : 'add'](
            files[highlightedFile].name
          );
          break;
        case '[3~': // Delete
        case '\x04': // Ctrl + d
          if (!selectedFiles.size) selectedFiles.add(files[highlightedFile].name);
          overlay = [
            `Do you want to delete ${selectedFiles.size} files? [y,N]`,
            '',
            answer => {
              if (answer.toLowerCase() !== 'y') return;
              selectedFiles.forEach(name =>
                Deno.removeSync(`${folder}/${name}`, { recursive: true })
              );
              selectedFiles.clear();
            }
          ];
          break;
        case '\x12': // Ctrl + r
        case 'OQ': // F2
          overlay = [
            `New name for ${files[highlightedFile].name}`,
            files[highlightedFile].name,
            answer =>
              answer &&
              Deno.renameSync(`${folder}/${files[highlightedFile].name}`, `${folder}/${answer}`)
          ];
          break;
        default: {
          // Deno.writeTextFile('log', key);
          //Drag and drop
          if (key[0] === "'" && key.slice(-1) === "'")
            return Deno.copyFile(
              key.slice(1, -1),
              `${folder}/${key.slice(1, -1).split('/').at(-1)}`
            ).catch(() => {});

          const filteredFiles = files
            .map((file, i) => ({ ...file, i }))
            .filter(({ name }) => name.toLowerCase().startsWith(key.toLowerCase()));
          if (filteredFiles.length)
            highlightedFile =
              filteredFiles[
                (filteredFiles.findIndex(({ i }) => i === highlightedFile) + 1) %
                  filteredFiles.length
              ].i;
        }
      }
    });
  render();
}
