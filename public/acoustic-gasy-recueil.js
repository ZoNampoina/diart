(()=>{
  function makeCard(){
    const card=document.createElement('section');card.id='acoustic-gasy-recueil-card';card.className='panel external-recueil-card';
    card.innerHTML=`<div class="external-recueil-head"><span class="recueil-badge">AG</span><div><p class="eyebrow">Recherche intégrée</p><h2>Acoustic Gasy</h2><p>Tondrom-peo Malagasy : recherchez par titre et artiste, puis importez les données disponibles dans DI’ART.</p></div></div><div class="external-recueil-fields"><label>Titre<div class="field-clear-wrap"><input data-ag-title placeholder="Titre du morceau"></div></label><label>Artiste <small>optionnel</small><div class="field-clear-wrap"><input data-ag-artist placeholder="Nom de l’artiste"></div></label><button class="primary recueil-search-icon" data-ag-search aria-label="Rechercher sur Acoustic Gasy" title="Rechercher sur Acoustic Gasy"><span style="font-size:18px">⌕</span></button></div><div data-ag-state></div>`;
    const title=card.querySelector('[data-ag-title]'),artist=card.querySelector('[data-ag-artist]'),btn=card.querySelector('[data-ag-search]'),state=card.querySelector('[data-ag-state]');
    const run=()=>{const q=title.value.trim();if(q.length<2)return;state.innerHTML='<div class="recueil-search-loading"><span>Recherche sur Acoustic Gasy…</span></div>';window.dispatchEvent(new CustomEvent('diart:acoustic-gasy-search',{detail:{title:q,artist:artist.value.trim(),state}}))};
    btn.addEventListener('click',run);title.addEventListener('keydown',e=>{if(e.key==='Enter')run()});artist.addEventListener('keydown',e=>{if(e.key==='Enter')run()});return card
  }
  function mount(){if(document.getElementById('acoustic-gasy-recueil-card'))return;const cards=[...document.querySelectorAll('section.panel')];const chord=cards.find(x=>/Chordify/i.test(x.textContent||''));if(!chord)return;chord.insertAdjacentElement('afterend',makeCard())}
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();