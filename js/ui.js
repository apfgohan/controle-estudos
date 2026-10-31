// Componentes e utilitários de interface reutilizados por todas as abas.
var UI = (function () {
  // Cria um elemento: el('div', { class: 'x', onclick: fn, text: 'oi' }, [filhos])
  function el(tag, props, filhos) {
    var n = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v; // só para ícones e textos fixos do próprio programa
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else if (k in n && k !== 'list' && k !== 'type') n[k] = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    adicionar(n, filhos);
    return n;
  }

  function adicionar(n, f) {
    if (f == null || f === false) return;
    if (Array.isArray(f)) { f.forEach(function (x) { adicionar(n, x); }); return; }
    n.appendChild(typeof f === 'object' ? f : document.createTextNode(String(f)));
  }

  // ---------- Ícones (traço simples, herdam a cor do texto) ----------
  var caminhos = {
    progresso: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
    lista: '<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r=".6" fill="currentColor"/>',
    relogio: '<circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14.5 15"/><line x1="10" y1="2.5" x2="14" y2="2.5"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><line x1="3.5" y1="10" x2="20.5" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    seta: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
    check: '<polyline points="5 12.5 10 17.5 19 7"/>',
    trocar: '<polyline points="16 3 20 7 16 11"/><line x1="4" y1="7" x2="20" y2="7"/><polyline points="8 21 4 17 8 13"/><line x1="20" y1="17" x2="4" y2="17"/>',
    historico: '<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/>',
    nota: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    voltar: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/>',
    play: '<polygon points="7 4 19 12 7 20 7 4" fill="currentColor"/>',
    externo: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    abrir: '<polyline points="6 9 12 15 18 9"/>',
    caderno: '<rect x="4" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="14" y2="8"/><line x1="8" y1="12" x2="14" y2="12"/><path d="M18 7h2v10h-2"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    alerta: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><circle cx="12" cy="16" r=".6" fill="currentColor"/>',
    caderno2: '<rect x="4" y="4" width="16" height="16" rx="3"/><polyline points="8.5 12 11 14.5 15.5 9.5"/>',
    trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3"/><path d="M16 6h3v1a3 3 0 0 1-3 3"/><line x1="12" y1="13" x2="12" y2="17"/><path d="M8.5 20h7l-1-3h-5z"/>'
  };

  function icone(nome, classe) {
    return el('span', {
      class: 'icone ' + (classe || ''),
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + caminhos[nome] + '</svg>'
    });
  }

  // ---------- Datas e números ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function paraIso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hoje() { return paraIso(new Date()); }
  function somarDias(iso, dias) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return paraIso(d);
  }
  function diasEntre(isoA, isoB) {
    return Math.round((new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / 86400000);
  }
  function fmtData(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  // "Hoje", "Ontem", "Há 3 dias" ou a data, como nos prints.
  function haQuanto(iso) {
    if (!iso) return '—';
    var d = diasEntre(iso, hoje());
    if (d === 0) return 'Hoje';
    if (d === 1) return 'Ontem';
    if (d > 1 && d <= 7) return 'Há ' + d + ' dias';
    return fmtData(iso);
  }
  function fmtPct(v) {
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  }
  function fmtNum(v) { return Number(v || 0).toLocaleString('pt-BR'); }
  function fmtDuracao(seg) {
    seg = Math.round(seg || 0);
    return pad(Math.floor(seg / 3600)) + ':' + pad(Math.floor((seg % 3600) / 60)) + ':' + pad(seg % 60);
  }

  // ---------- Componentes ----------
  function barra(pct, cor) {
    return el('div', { class: 'barra' }, el('div', {
      class: 'barra-preenchida' + (pct >= 100 ? ' completa' : ''),
      style: { width: Math.max(0, Math.min(100, pct)) + '%', background: pct >= 100 ? null : cor }
    }));
  }

  function cartao(nomeIcone, rotulo, valor) {
    return el('div', { class: 'cartao' }, [
      el('div', { class: 'cartao-icone' }, icone(nomeIcone)),
      el('div', null, [el('div', { class: 'cartao-rotulo', text: rotulo }), el('div', { class: 'cartao-valor', text: valor })])
    ]);
  }

  function selo(texto, tipo) { return el('span', { class: 'selo selo-' + (tipo || 'neutro'), text: texto }); }

  function botao(texto, aoClicar, classe, nomeIcone) {
    return el('button', { type: 'button', class: 'btn ' + (classe || ''), onclick: aoClicar }, [
      nomeIcone ? icone(nomeIcone) : null, texto
    ]);
  }

  function botaoEngrenagem(aoClicar, titulo) {
    return el('button', { type: 'button', class: 'btn-icone', title: titulo || 'Editar', onclick: aoClicar }, icone('engrenagem'));
  }

  function metrica(rotulo, valor, classeValor) {
    return el('div', { class: 'metrica' }, [
      el('div', { class: 'metrica-rotulo', text: rotulo }),
      el('div', { class: 'metrica-valor ' + (classeValor || ''), text: valor })
    ]);
  }

  function blocoAnotacao(sessao, detalhe) {
    if (!sessao) return null;
    return el('div', { class: 'anotacao' }, [
      el('div', { class: 'anotacao-icone' }, icone('nota')),
      el('div', null, [
        el('div', { class: 'anotacao-titulo', text: 'Última anotação' }),
        el('div', { class: 'anotacao-texto', text: sessao.anotacao }),
        el('div', { class: 'anotacao-meta', text: 'Salvo em ' + fmtData(sessao.data) + (detalhe ? ' · ' + detalhe : '') })
      ])
    ]);
  }

  // ---------- Modal ----------
  // botoes: [{ texto, classe, acao }]; se acao retornar false, o modal continua aberto.
  // opcoes (opcional): { icone, subtitulo } para o cabeçalho.
  function modal(titulo, corpo, botoes, opcoes) {
    opcoes = opcoes || {};
    var fundo = el('div', { class: 'modal-fundo' });
    function fechar() {
      document.removeEventListener('keydown', aoTeclar);
      fundo.remove();
    }
    function aoTeclar(e) { if (e.key === 'Escape') fechar(); }
    var rodape = botoes && botoes.length ? el('div', { class: 'modal-rodape' }, botoes.map(function (b) {
      return botao(b.texto, function () {
        if (!b.acao || b.acao() !== false) fechar();
      }, b.classe);
    })) : null;
    var caixa = el('form', { class: 'modal', onsubmit: function (e) {
      e.preventDefault();
      var principal = rodape && rodape.querySelector('.btn-primario');
      if (principal) principal.click();
    } }, [
      el('div', { class: 'modal-cabecalho' + (opcoes.subtitulo ? ' com-subtitulo' : '') }, [
        opcoes.icone ? el('div', { class: 'modal-icone' }, icone(opcoes.icone)) : null,
        el('div', { class: 'modal-cabecalho-texto' }, [
          el('div', { class: 'modal-titulo', text: titulo }),
          opcoes.subtitulo ? el('div', { class: 'modal-subtitulo', text: opcoes.subtitulo }) : null
        ]),
        el('button', { type: 'button', class: 'modal-fechar', title: 'Fechar', onclick: fechar, text: '✕' })
      ]),
      el('div', { class: 'modal-corpo' }, corpo),
      rodape,
      el('button', { type: 'submit', hidden: true }) // permite confirmar com Enter
    ]);
    fundo.appendChild(caixa);
    fundo.addEventListener('mousedown', function (e) { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', aoTeclar);
    document.body.appendChild(fundo);
    var foco = caixa.querySelector('input, textarea, select');
    if (foco) foco.focus();
    return { fechar: fechar, caixa: caixa };
  }

  function confirmar(mensagem, aoConfirmar, textoBotao) {
    modal('Confirmar', el('p', { text: mensagem }), [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: textoBotao || 'Excluir', classe: 'btn-perigo', acao: aoConfirmar }
    ]);
  }

  function campo(rotulo, controle, ajuda) {
    // <label> só envolve um controle simples; grupos (listas, botões) usam <div>.
    var simples = controle && /^(INPUT|SELECT|TEXTAREA)$/.test(controle.tagName);
    return el(simples ? 'label' : 'div', { class: 'campo' }, [
      el('span', { class: 'campo-rotulo', text: rotulo }),
      controle,
      ajuda ? el('span', { class: 'campo-ajuda', text: ajuda }) : null
    ]);
  }

  // Select de posição 1..n
  function seletorPosicao(total, atual) {
    var s = el('select');
    for (var i = 1; i <= total; i++) s.appendChild(el('option', { value: i, text: i + 'º', selected: i === atual }));
    return s;
  }

  // Percentual de acerto com bolinha colorida: verde ≥ 80%, amarelo ≥ 65%, vermelho abaixo.
  function acerto(pct, feitas, comFundo) {
    if (!feitas) return el('span', { class: 'data-fraca', text: '—' });
    var nivel = pct >= 80 ? 'bom' : pct >= 65 ? 'medio' : 'ruim';
    return el('span', { class: 'acerto acerto-' + nivel + (comFundo ? ' com-fundo' : '') }, [
      el('span', { class: 'acerto-ponto' }), fmtPct(pct)
    ]);
  }

  var prioridades = { alta: ['Alta', 'perigo'], media: ['Média', 'aviso'], baixa: ['Baixa', 'info'] };
  function seloPrioridade(p) {
    var x = prioridades[p] || prioridades.media;
    return selo(x[0], x[1] + ' selo-largo');
  }

  function aviso(texto) {
    var a = el('div', { class: 'toast', text: texto });
    document.body.appendChild(a);
    setTimeout(function () { a.classList.add('saindo'); }, 2200);
    setTimeout(function () { a.remove(); }, 2700);
  }

  return {
    el: el, icone: icone,
    hoje: hoje, somarDias: somarDias, diasEntre: diasEntre, fmtData: fmtData, haQuanto: haQuanto,
    fmtPct: fmtPct, fmtNum: fmtNum, fmtDuracao: fmtDuracao,
    barra: barra, cartao: cartao, selo: selo, botao: botao, botaoEngrenagem: botaoEngrenagem, metrica: metrica,
    blocoAnotacao: blocoAnotacao, modal: modal, confirmar: confirmar, campo: campo, seletorPosicao: seletorPosicao,
    acerto: acerto, seloPrioridade: seloPrioridade, aviso: aviso
  };
})();
