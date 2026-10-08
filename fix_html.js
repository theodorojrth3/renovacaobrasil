const fs = require('fs');
let html = fs.readFileSync('site-mirror/index.html', 'utf8');

const script = `<script>
document.addEventListener('DOMContentLoaded', function() {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    const text = btn.textContent || '';
    if (text.includes('Iniciar Processo Agora')) {
      btn.onclick = function() { window.location.href = '/login'; };
    }
  });
});
</script>
`;

html = html.replace(/<script>[\s\S]*?<\/script><\/body>/, script + '</body>');
fs.writeFileSync('site-mirror/index.html', html);
console.log('Done');