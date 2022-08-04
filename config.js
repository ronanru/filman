export default {
  icons: true, // if icons are enabled
  topBarButtons: [
    {
      name: folder => (folder.includes('Coding') ? '  CODE ' : null),
      onClick: cwd =>
        Deno.run({
          cmd: ['/bin/codium', '.'],
          cwd
        })
    },
    {
      name: () => '  GUI ',
      onClick: cwd =>
        Deno.run({
          cmd: ['/bin/xdg-open', '.'],
          cwd,
          stdout: 'null'
        })
    }
  ]
};
