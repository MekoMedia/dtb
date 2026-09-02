(function(){
"use strict";

var SUPABASE_URL = "https://dnbqgdjdalzvbqvagmmz.supabase.co/rest/v1/";
var SUPABASE_ANON_KEY = "sb_publishable_eP8Po7tli12Fkuoue2UKsg_Vm2vZ9Ok";
var JSON_URL = "database_827_383_294_103_759_927_953.json";
var REPORT_ENDPOINT = "https://formsubmit.co/ajax/mekonetwork@gmail.com";
var HASH_SHARE_LINKS = true;
var USERS_KEY = 'meko-registered-users';
var CURRENT_USER_KEY = 'meko-current-user';
var POSTS_PER_PAGE = 6;

var currentUser = null;
var DATABASEPOSTS = [];
var allPosts = [];
var videoPosts = [];
var activeReelList = [];
var displayedPosts = new Set();
var hasMorePosts = true;
var isLoading = false;
var isMuted = true;
var currentShareId = null;
var pendingMediaType = null;
var reportTargetPost = null;
var supabaseClient = null;
var reelObserver = null;
var reelRenderedIdx = new Set();
var reelIconTimers = {};
var currentReelIndex = 0;
var watchedThisSession = new Set();
var cpType = 'text';
var lastFeedVideo = null;
var lastFeedTime = 0;
var feedObserver = null;
var feedVideoObserver = null;

var $ = function(id){ return document.getElementById(id); };

function initSupabase(){
if (window.supabase && SUPABASE_URL && SUPABASE_URL.indexOf('YOUR_') !== 0){
  try { supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
  catch(e){ console.warn('Supabase init failed:', e); }
}
}

function fetchSupabasePosts(){
if (!supabaseClient) return Promise.resolve([]);
return supabaseClient.from('posts').select('*').order('created_at', { ascending: false })
  .then(function(res){ if (res.error){ console.warn('Supabase fetch failed:', res.error.message); return []; } return res.data || []; })
  .catch(function(e){ console.warn('Supabase fetch error:', e); return []; });
}

function insertPostToSupabase(post){
if (!supabaseClient) return;
supabaseClient.from('posts').insert([post]).then(function(res){
  if (res.error) console.warn('Supabase insert failed:', res.error.message);
}).catch(function(e){ console.warn('Supabase insert error:', e); });
}

function getRegisteredUsers(){ try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch(e){ return {}; } }
function saveRegisteredUser(username, data){ var users = getRegisteredUsers(); users[username] = data; localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function isUsernameTaken(username){ var users = getRegisteredUsers(); if (users[username]) return true; return DATABASEPOSTS.some(function(p){ return p.username === username; }); }

function saveCurrentUser(){
if (!currentUser || currentUser.isGuest) return;
var toSave = Object.assign({}, currentUser, { likedPosts: Array.from(currentUser.likedPosts || []), followedTopics: Array.from(currentUser.followedTopics || []) });
localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(toSave));
var users = getRegisteredUsers();
if (users[currentUser.username]){
  users[currentUser.username] = Object.assign({}, users[currentUser.username], { likedPosts: toSave.likedPosts, searchHistory: toSave.searchHistory, followedTopics: toSave.followedTopics });
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
}

function checkAuth(){
var saved = localStorage.getItem(CURRENT_USER_KEY);
if (saved){
  try {
    var parsed = JSON.parse(saved);
    currentUser = Object.assign({}, parsed, { likedPosts: new Set(parsed.likedPosts||[]), followedTopics: new Set(parsed.followedTopics||[]), isGuest: false });
    hideAuth(); updateUserUI(); return;
  } catch(e){ localStorage.removeItem(CURRENT_USER_KEY); }
}
currentUser = { name:'Guest', username:'guest', email:'', likedPosts:new Set(), searchHistory:[], followedTopics:new Set(), isGuest:true };
showAuth(); updateUserUI();
}

function showAuth(){ $('fsxAuthModal').classList.add('active'); $('fsxApp').classList.add('hidden'); }
function hideAuth(){ $('fsxAuthModal').classList.remove('active'); $('fsxApp').classList.remove('hidden'); }

function updateUserUI(){
if (!currentUser) return;
var avatar = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUser.name) + '&background=2dd4bf&color=06131a&bold=true';
$('fsxUserAvatarImg').src = avatar;
$('fsxTriggerAvatar').src = avatar;
}

$('fsxCreateAccountBtn').addEventListener('click', function(){ document.querySelector('.fsx-auth-tab[data-tab="signup"]').click(); });

document.querySelectorAll('.fsx-auth-tab').forEach(function(tab){
tab.addEventListener('click', function(){
  document.querySelectorAll('.fsx-auth-tab').forEach(function(t){ t.classList.remove('active'); });
  tab.classList.add('active');
  document.querySelectorAll('.fsx-form').forEach(function(f){ f.classList.remove('active'); });
  $('fsx' + (tab.dataset.tab === 'login' ? 'Login' : 'Signup') + 'Form').classList.add('active');
  $('fsxLoginError').style.display = 'none';
  $('fsxUsernameError').style.display = 'none';
});
});

$('fsxLoginForm').addEventListener('submit', function(e){
e.preventDefault();
var username = $('fsxLoginUsername').value.trim().toLowerCase();
var password = $('fsxLoginPassword').value.trim();
var err = $('fsxLoginError'); err.style.display = 'none';
if (!username || !password){ err.textContent = 'Please fill in all fields'; err.style.display='block'; return; }
var users = getRegisteredUsers();
if (!users[username]){ err.textContent = 'Account not found. Please sign up first.'; err.style.display='block'; return; }
if (users[username].password !== password){ err.textContent = 'Wrong password. Please try again.'; err.style.display='block'; return; }
var userData = users[username];
currentUser = { name:userData.name, username:username, email:userData.email, likedPosts:new Set(userData.likedPosts||[]), searchHistory:userData.searchHistory||[], followedTopics:new Set(userData.followedTopics||[]), isGuest:false };
saveCurrentUser(); hideAuth(); updateUserUI(); loadSearchHistory(); loadTrendingTopics(); loadSuggestedProfiles();
$('fsxLoginForm').reset();
});

$('fsxSignupForm').addEventListener('submit', function(e){
e.preventDefault();
var name = $('fsxSignupName').value.trim();
var username = $('fsxSignupUsername').value.trim().toLowerCase();
var email = $('fsxSignupEmail').value.trim();
var password = $('fsxSignupPassword').value.trim();
var confirm = $('fsxSignupConfirm').value.trim();
var err = $('fsxSignupError'); err.style.display = 'none'; $('fsxUsernameError').style.display = 'none';
if (!name || !username || !email || !password || !confirm){ err.textContent = 'Please fill in all fields'; err.style.display='block'; return; }
if (password !== confirm){ err.textContent = 'Passwords do not match'; err.style.display='block'; return; }
if (password.length < 6){ err.textContent = 'Password must be at least 6 characters'; err.style.display='block'; return; }
if (isUsernameTaken(username)){ $('fsxUsernameError').textContent = 'This username is already taken.'; $('fsxUsernameError').style.display='block'; return; }
var userData = { name:name, email:email, password:password, likedPosts:[], searchHistory:[], followedTopics:[], createdAt:new Date().toISOString() };
saveRegisteredUser(username, userData);
currentUser = { name:name, username:username, email:email, likedPosts:new Set(), searchHistory:[], followedTopics:new Set(), isGuest:false };
saveCurrentUser(); hideAuth(); updateUserUI();
$('fsxSignupForm').reset();
document.querySelector('.fsx-auth-tab[data-tab="login"]').click();
});

function handleLogout(){
localStorage.removeItem(CURRENT_USER_KEY);
showAuth();
$('fsxPostsFeed').innerHTML = '';
displayedPosts.clear(); hasMorePosts = true;
currentUser = { name:'Guest', username:'guest', email:'', likedPosts:new Set(), searchHistory:[], followedTopics:new Set(), isGuest:true };
updateUserUI();
}

$('fsxLogoutLink').addEventListener('click', function(e){ e.preventDefault(); handleLogout(); });
$('fsxMobileLogout').addEventListener('click', handleLogout);

$('fsxThemeBtn').addEventListener('click', function(){ document.body.classList.toggle('fsx-light'); });
$('fsxMenuToggle').addEventListener('click', function(){ $('fsxUserDropdown').classList.toggle('active'); });

document.addEventListener('click', function(e){
if (!e.target.closest('.fsx-user-menu')) $('fsxUserDropdown').classList.remove('active');
if (!e.target.closest('.fsx-search-wrap')) $('fsxSearchResults').style.display = 'none';
});

$('fsxProfileLink').addEventListener('click', function(e){ e.preventDefault(); showOwnProfile(); });
$('fsxMobileMenuToggle').addEventListener('click', function(){ $('fsxMobileMenuOverlay').classList.add('active'); });
$('fsxCloseMobileMenu').addEventListener('click', function(){ $('fsxMobileMenuOverlay').classList.remove('active'); });
$('fsxMobileMenuOverlay').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('active'); });

document.querySelectorAll('[data-nav]').forEach(function(btn){
btn.addEventListener('click', function(){
  var nav = btn.dataset.nav;
  if (btn.hasAttribute('data-close-mobile')) $('fsxMobileMenuOverlay').classList.remove('active');
  if (nav === 'videos'){ openReels(); return; }
  if (nav === 'profile'){ showOwnProfile(); return; }
  setActiveNav('home');
});
});

function setActiveNav(name){
document.querySelectorAll('.fsx-nav-item[data-nav]').forEach(function(n){ n.classList.toggle('active', n.dataset.nav === name); });
document.querySelectorAll('.fsx-bnav-item[data-nav]').forEach(function(n){ n.classList.toggle('active', n.dataset.nav === name); });
}

function setGlobalMute(val){
isMuted = val;
document.querySelectorAll('.fsx-feed-video-wrap video, .fsx-reel-media-wrap video').forEach(function(v){ v.muted = isMuted; });
document.querySelectorAll('.fsx-feed-mute-btn i').forEach(function(i){ i.className = 'fas ' + (isMuted ? 'fa-volume-mute' : 'fa-volume-up'); });
var reelIcon = $('fsxReelMuteIcon');
if (reelIcon) reelIcon.className = 'fas ' + (isMuted ? 'fa-volume-mute' : 'fa-volume-up');
}

$('fsxReelMute').addEventListener('click', function(){ setGlobalMute(!isMuted); });

$('fsxSearchInput').addEventListener('input', function(){
var query = this.value.trim().toLowerCase();
if (!query){ $('fsxSearchResults').style.display = 'none'; return; }
renderSearchResults(searchProfiles(query), searchTopics(query), searchPosts(query), query);
});

function searchProfiles(query){
var seen = new Map();
DATABASEPOSTS.forEach(function(post){
  if (!seen.has(post.username)){
    var userPosts = DATABASEPOSTS.filter(function(p){ return p.username === post.username; });
    var totalLikes = userPosts.reduce(function(s,p){ return s + (p.likes||0); }, 0);
    seen.set(post.username, { name: post.name, username: post.username, postsCount: userPosts.length, totalLikes: totalLikes });
  }
});
return Array.from(seen.values()).filter(function(u){ return u.name.toLowerCase().includes(query) || u.username.toLowerCase().includes(query); });
}

function searchTopics(query){
var topics = {};
DATABASEPOSTS.forEach(function(post){ if (post.topic && post.topic.toLowerCase().includes(query)) topics[post.topic] = (topics[post.topic]||0)+1; });
return Object.entries(topics).map(function(e){ return { name:'#'+e[0], topic:e[0], postsCount:e[1] }; }).sort(function(a,b){ return b.postsCount-a.postsCount; });
}

function searchPosts(query){
return allPosts.filter(function(post){ return (post.content && post.content.toLowerCase().includes(query)) || (post.topic && post.topic.toLowerCase().includes(query)); })
  .map(function(post){ return { name:post.name, username:post.username, content: post.content ? post.content.substring(0,100)+(post.content.length>100?'...':'') : '', postId:post.id }; })
  .slice(0,5);
}

function renderSearchResults(profiles, topics, posts, query){
var wrap = $('fsxSearchResults'); wrap.innerHTML = ''; var any = false;
if (profiles.length){ any = true; wrap.appendChild(sectionHeader('Profiles'));
  profiles.slice(0,5).forEach(function(p){
    var item = resultItem('<img src="https://ui-avatars.com/api/?name='+encodeURIComponent(p.name)+'&background=1e3a8a&color=fff">', p.name, '@'+p.username+' · '+p.postsCount+' posts');
    item.addEventListener('click', function(){ showUserProfile(p.username, p.name); addToSearchHistory(p.username, p.name, 'profile'); closeSearch(); });
    wrap.appendChild(item);
  });
}
if (topics.length){ any = true; wrap.appendChild(sectionHeader('Topics'));
  topics.slice(0,5).forEach(function(t){
    var item = resultItem('<div style="width:36px;height:36px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--teal);"><i class="fas fa-hashtag"></i></div>', t.name, t.postsCount+' posts');
    item.addEventListener('click', function(){ filterPostsByTopic(t.topic); addToSearchHistory(t.topic, t.name, 'topic'); closeSearch(); });
    wrap.appendChild(item);
  });
}
if (posts.length){ any = true; wrap.appendChild(sectionHeader('Posts'));
  posts.forEach(function(p){
    var item = resultItem('<div style="width:36px;height:36px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--indigo);"><i class="fas fa-file-alt"></i></div>', p.name, p.content || ('@'+p.username));
    item.addEventListener('click', function(){ scrollToPost(p.postId); addToSearchHistory(p.username, 'Post by '+p.name, 'post'); closeSearch(); });
    wrap.appendChild(item);
  });
}
if (!any) wrap.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-mute);"><i class="fas fa-search" style="font-size:1.4rem;display:block;margin-bottom:0.5rem;"></i>No results for "'+escapeHtml(query)+'"</div>';
wrap.style.display = 'block';
}

function sectionHeader(t){ var d = document.createElement('div'); d.className = 'fsx-search-section-header'; d.textContent = t; return d; }
function resultItem(imgHtml, title, sub){ var d = document.createElement('div'); d.className = 'fsx-search-result-item'; d.innerHTML = imgHtml + '<div><h4>'+escapeHtml(title)+'</h4><span>'+escapeHtml(sub)+'</span></div>'; return d; }
function closeSearch(){ $('fsxSearchInput').value = ''; $('fsxSearchResults').style.display = 'none'; }
function scrollToPost(postId){ var el = document.querySelector('[data-post-id="'+postId+'"]'); if (el) el.scrollIntoView({ behavior:'smooth', block:'center' }); }

function addToSearchHistory(identifier, name, type){
if (!currentUser || currentUser.isGuest) return;
if (!currentUser.searchHistory) currentUser.searchHistory = [];
currentUser.searchHistory = currentUser.searchHistory.filter(function(i){ return !(i.identifier===identifier && i.type===type); });
currentUser.searchHistory.unshift({ identifier:identifier, name:name, type:type });
currentUser.searchHistory = currentUser.searchHistory.slice(0,5);
saveCurrentUser(); loadSearchHistory();
}

function loadSearchHistory(){
var wrap = $('fsxSearchHistory'); if (!wrap) return; wrap.innerHTML = '';
if (!currentUser || !currentUser.searchHistory) return;
currentUser.searchHistory.forEach(function(item){
  var icon = item.type==='profile'?'user':item.type==='topic'?'hashtag':'file-alt';
  var d = document.createElement('div'); d.className = 'fsx-history-item';
  d.innerHTML = '<div class="row"><i class="fas fa-'+icon+'" style="color:var(--text-mute);width:16px;"></i><div><div style="font-weight:600;font-size:0.84rem;">'+escapeHtml(item.name)+'</div><div class="meta">'+item.type+'</div></div></div>';
  d.addEventListener('click', function(){
    if (item.type==='profile') showUserProfile(item.identifier, item.name);
    else if (item.type==='topic') filterPostsByTopic(item.identifier);
    else scrollToPost(item.identifier);
  });
  wrap.appendChild(d);
});
}

function parseCustomDate(dateString){
try {
  var months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  if (!dateString || typeof dateString !== 'string') return new Date();
  var parts = dateString.split(' ');
  if (parts.length < 4) return new Date();
  var month = months[parts[0]]; var day = parseInt(parts[1]); var year = parseInt(parts[2]);
  if (month === undefined) return new Date();
  var m = parts[3].match(/(\d+):(\d+)(AM|PM)/i);
  if (!m) return new Date(year, month, day);
  var hours = parseInt(m[1]); var minutes = parseInt(m[2]); var ampm = m[3].toUpperCase();
  if (ampm==='PM' && hours<12) hours+=12; if (ampm==='AM' && hours===12) hours=0;
  return new Date(year, month, day, hours, minutes);
} catch(e){ return new Date(); }
}

function formatRelativeDate(date){
try {
  var diffMs = new Date() - date;
  var s = Math.floor(diffMs/1000), m = Math.floor(s/60), h = Math.floor(m/60);
  if (s<10) return 'Just now'; if (s<60) return s+'s'; if (m<60) return m+'m'; if (h<=10) return h+'h';
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[date.getMonth()]+' '+date.getDate()+' '+date.getFullYear();
} catch(e){ return ''; }
}

function formatJoinedDate(date){ var months=['January','February','March','April','May','June','July','August','September','October','November','December']; return months[date.getMonth()]+' '+date.getFullYear(); }

function formatNowAsCustom(){
var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; var d=new Date();
var h=d.getHours(); var ampm=h>=12?'PM':'AM'; var h12=h%12||12; var mm=d.getMinutes().toString().padStart(2,'0');
return months[d.getMonth()]+' '+d.getDate()+' '+d.getFullYear()+' '+h12+':'+mm+ampm;
}

function formatNum(n){ if (!n) return '0'; if (n>=1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'')+'M'; if (n>=1000) return (n/1000).toFixed(1).replace(/\.0$/,'')+'K'; return n.toString(); }
function escapeHtml(str){ if (!str) return ''; return String(str).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

function fetchGithubPosts(){
var timeout = new Promise(function(_, reject){ setTimeout(function(){ reject(new Error('timeout')); }, 10000); });
var req = fetch(JSON_URL)
  .then(function(res){ if (!res.ok) throw new Error('HTTP '+res.status); return res.text(); })
  .then(function(text){
    var cleaned = text.trim();
    if (!cleaned.endsWith('}') && !cleaned.endsWith(']')){
      var cut = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
      if (cut>0) cleaned = cleaned.substring(0, cut+1);
    }
    var data = JSON.parse(cleaned);
    return Array.isArray(data) ? data : (data.posts || data.data || []);
  });
return Promise.race([req, timeout]).catch(function(err){ console.error('GitHub fetch error:', err); return []; });
}

function fetchPosts(){
$('fsxPostsFeed').innerHTML = '<div class="fsx-load-status"><div class="fsx-spinner"></div>Loading posts...</div>';
Promise.all([fetchGithubPosts(), fetchSupabasePosts()]).then(function(results){
  processPosts((results[0]||[]).concat(results[1]||[]));
}).catch(function(err){
  console.error('Load error:', err);
  renderErrorState(err.message || 'Failed to load posts');
});
}

function processPosts(postsArray){
var valid = (postsArray||[]).filter(function(post){
  if (!post || typeof post !== 'object') return false;
  if (!post.name || !post.username || !post.datePost) return false;
  var d = parseCustomDate(post.datePost);
  return !isNaN(d.getTime());
});
if (!valid.length){ renderEmptyState(); return; }

DATABASEPOSTS = valid.slice();
DATABASEPOSTS.forEach(function(post, i){ if (!post.id) post.id = 'meko-'+post.username.toLowerCase()+'-reco'+(DATABASEPOSTS.length-i); });

$('fsxPostsFeed').innerHTML = '';
displayedPosts.clear(); hasMorePosts = true;

allPosts = DATABASEPOSTS.slice().reverse();
shuffleArray(allPosts);

videoPosts = DATABASEPOSTS.filter(isVideoEligible);

loadTrendingTopics(); loadSuggestedProfiles(); loadMoreFeedPosts();
}

function isVideoEligible(p){
if (p.video) return true;
if (p.iframe){ var s=p.iframe.toLowerCase(); return s.includes('youtube.com/embed')||s.includes('youtu.be')||s.includes('vimeo')||s.includes('embed'); }
return false;
}

function shuffleArray(arr){ for (var i=arr.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=arr[i]; arr[i]=arr[j]; arr[j]=t; } return arr; }
function renderEmptyState(){ $('fsxPostsFeed').innerHTML = '<div class="fsx-empty-state"><i class="fas fa-newspaper"></i><h3>No posts available</h3><p>No posts could be loaded.</p><button class="btn btn-secondary" onclick="location.reload()" style="margin-top:0.75rem;"><i class="fas fa-redo"></i> Try Again</button></div>'; }
function renderErrorState(message){ $('fsxPostsFeed').innerHTML = '<div class="fsx-error-state"><i class="fas fa-triangle-exclamation"></i><h3>Failed to load posts</h3><p>'+escapeHtml(message)+'</p><button class="btn btn-primary" onclick="location.reload()" style="margin-top:0.75rem;"><i class="fas fa-redo"></i> Retry</button></div>'; }

feedObserver = new IntersectionObserver(function(entries){
entries.forEach(function(entry){ if (entry.isIntersecting && !isLoading && hasMorePosts) loadMoreFeedPosts(); });
}, { rootMargin: '600px 0px', threshold: 0 });

if ($('fsxSentinel')) feedObserver.observe($('fsxSentinel'));

function loadMoreFeedPosts(){
if (isLoading || !hasMorePosts || !allPosts.length) return;
isLoading = true;
$('fsxLoadStatus').innerHTML = '<div class="fsx-spinner"></div>Loading more...';
setTimeout(function(){
  var toShow = allPosts.filter(function(p){ return !displayedPosts.has(p.id); }).slice(0, POSTS_PER_PAGE);
  if (!toShow.length){
    hasMorePosts = false;
    $('fsxLoadStatus').textContent = allPosts.length ? "You're all caught up" : '';
    isLoading = false; return;
  }
  var frag = document.createDocumentFragment();
  toShow.forEach(function(post){ frag.appendChild(createPostCard(post, post.id)); displayedPosts.add(post.id); });
  $('fsxPostsFeed').appendChild(frag);
  hasMorePosts = (allPosts.length - displayedPosts.size) > 0;
  $('fsxLoadStatus').textContent = hasMorePosts ? '' : "You're all caught up";
  isLoading = false;
}, 200);
}

feedVideoObserver = new IntersectionObserver(function(entries){
entries.forEach(function(entry){
  var vid = entry.target;
  var reelOpen = $('fsxReelsView') && $('fsxReelsView').classList.contains('active');
  if(reelOpen){
    vid.pause();
    return;
  }
  if (entry.isIntersecting && entry.intersectionRatio >= 0.6){
    vid.muted = isMuted;
    vid.play().catch(function(){});
  } else if (!vid.paused) {
    vid.pause();
  }
});
}, { threshold: 0.6 });

function renderMedia(post, postId){
if (post.video){
  return '<div class="fsx-post-media fsx-feed-video-wrap"><video src="'+post.video+'" muted loop playsinline preload="metadata" oncontextmenu="return false;"></video><button class="fsx-feed-mute-btn" type="button" data-action="feed-mute"><i class="fas '+(isMuted?'fa-volume-mute':'fa-volume-up')+'"></i></button></div>';
}
if (post.audio){
  return '<div class="fsx-audio-card"><div class="disc"><i class="fas fa-music"></i></div><audio src="'+post.audio+'" controls preload="none"></audio></div>';
}
if (post.iframe){
  return '<div class="fsx-post-media"><iframe src="'+post.iframe+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
}
if (post.image){
  return '<div class="fsx-post-media"><img src="'+post.image+'" alt="Post image" loading="lazy" oncontextmenu="return false;"></div>';
}
return '';
}

function createPostCard(post, postId){
var card = document.createElement('div');
card.className = 'fsx-post-card';
card.dataset.postId = postId;
card.dataset.topic = post.topic || '';

var isVideoPost = isVideoEligible(post);
var date = parseCustomDate(post.datePost);
var processedContent = (post.content||'').replace(/@(\w+)/g, function(m,u){ return '<span class="mention" data-username="'+u+'">@'+u+'</span>'; });
var avatar = 'https://ui-avatars.com/api/?name='+encodeURIComponent(post.name)+'&background=1e3a8a&color=fff';
var isLiked = currentUser && currentUser.likedPosts && currentUser.likedPosts.has(postId);

card.innerHTML =
  '<div class="fsx-post-header">' +
    '<div class="fsx-post-user" data-username="'+escapeHtml(post.username)+'">' +
      '<img src="'+avatar+'" alt="'+escapeHtml(post.name)+'">' +
      '<div><h3>'+escapeHtml(post.name)+'</h3><span>@'+escapeHtml(post.username)+' · '+formatRelativeDate(date)+'</span></div>' +
    '</div>' +
    (isVideoPost ? '<div class="fsx-video-tag" data-action="open-reel"><i class="fas fa-play"></i> Reel</div>' : '') +
  '</div>' +
  '<div class="fsx-post-content">' + (post.content ? '<p>'+processedContent+'</p>' : '') + '</div>' +
  renderMedia(post, postId) +
  '<div class="fsx-post-stats"><span>'+(post.likes||0).toLocaleString()+' likes</span></div>' +
  '<div class="fsx-post-actions">' +
    '<button class="fsx-action-btn'+(isLiked?' liked':'')+'" data-action="like"><i class="fas fa-heart"></i> Like</button>' +
    '<button class="fsx-action-btn" data-action="share"><i class="fas fa-share-alt"></i> Share</button>' +
    '<button class="fsx-action-btn report-btn" data-action="report"><i class="fas fa-flag"></i></button>' +
  '</div>';

card.querySelector('.fsx-post-user').addEventListener('click', function(){ showUserProfile(post.username, post.name); });

var likeBtn = card.querySelector('[data-action="like"]');
likeBtn.addEventListener('click', function(){ handleLike(post, postId, likeBtn); });

card.querySelector('[data-action="share"]').addEventListener('click', function(){ openShareModal(post, postId); });
card.querySelector('[data-action="report"]').addEventListener('click', function(){ openReportModal(post); });

card.querySelectorAll('.mention').forEach(function(m){
  m.addEventListener('click', function(e){ e.stopPropagation(); var uname = m.dataset.username; if (DATABASEPOSTS.some(function(p){ return p.username===uname; })) showUserProfile(uname, uname); });
});

var videoWrap = card.querySelector('.fsx-feed-video-wrap');
if (videoWrap){
  var videoEl = videoWrap.querySelector('video');
  if (videoEl) {
    feedVideoObserver.observe(videoEl);
    
    var muteBtn = videoWrap.querySelector('[data-action="feed-mute"]');
    if (muteBtn) {
      muteBtn.addEventListener('click', function(e){ e.stopPropagation(); setGlobalMute(!isMuted); });
    }
    
    videoWrap.addEventListener('click', function(){
      lastFeedVideo = videoEl;
      lastFeedTime = videoEl.currentTime || 0;
      videoEl.pause();
      openReelsAt(postId, lastFeedTime);
    });
  }
}

var reelTag = card.querySelector('[data-action="open-reel"]');
if (reelTag){
  reelTag.addEventListener('click', function(e){
    e.stopPropagation();
    var vEl = card.querySelector('.fsx-feed-video-wrap video');
    openReelsAt(postId, vEl ? vEl.currentTime : 0);
  });
}

return card;
}

function handleLike(post, postId, btn){
if (!currentUser || currentUser.isGuest){ alert('Please login to like posts!'); return; }
if (!currentUser.likedPosts) currentUser.likedPosts = new Set();
var card = btn.closest('.fsx-post-card');
var statSpan = card ? card.querySelector('.fsx-post-stats span') : null;
var liked = currentUser.likedPosts.has(postId);
if (liked){ currentUser.likedPosts.delete(postId); post.likes = Math.max(0,(post.likes||0)-1); btn.classList.remove('liked'); btn.innerHTML = '<i class="fas fa-heart"></i> Like'; }
else { currentUser.likedPosts.add(postId); post.likes = (post.likes||0)+1; btn.classList.add('liked'); btn.innerHTML = '<i class="fas fa-heart"></i> Liked'; if (post.topic) bumpAffinity(post.topic, 2); }
if (statSpan) statSpan.textContent = (post.likes||0).toLocaleString() + ' likes';
saveCurrentUser();
}

function filterPostsByTopic(topic){
setActiveNav('home');
$('fsxPostsFeed').innerHTML = '';
displayedPosts.clear();
var filtered = allPosts.filter(function(p){ return p.topic === topic; });
if (!filtered.length){ $('fsxPostsFeed').innerHTML = '<div class="fsx-empty-state"><i class="fas fa-hashtag"></i><h3>No posts with #'+escapeHtml(topic)+'</h3></div>'; hasMorePosts=false; return; }
filtered.forEach(function(p){ $('fsxPostsFeed').appendChild(createPostCard(p, p.id)); displayedPosts.add(p.id); });
hasMorePosts = false; $('fsxLoadStatus').textContent = '';
}

function loadTrendingTopics(){
var topics = {};
DATABASEPOSTS.forEach(function(p){ if (p.topic) topics[p.topic] = (topics[p.topic]||0)+1; });
var sorted = Object.entries(topics).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);
var wrap = $('fsxTrendingList'); wrap.innerHTML = '';
sorted.forEach(function(e){
  var d = document.createElement('div'); d.className = 'fsx-trend-item';
  d.innerHTML = '<div class="name">#'+escapeHtml(e[0])+'</div><div class="count">'+e[1]+' posts</div>';
  d.addEventListener('click', function(){ filterPostsByTopic(e[0]); });
  wrap.appendChild(d);
});
}

function loadSuggestedProfiles(){
var seen = new Map();
DATABASEPOSTS.forEach(function(post){
  if (!seen.has(post.username)){
    var userPosts = DATABASEPOSTS.filter(function(p){ return p.username === post.username; });
    var totalLikes = userPosts.reduce(function(s,p){ return s+(p.likes||0); }, 0);
    seen.set(post.username, { name:post.name, username:post.username, postsCount:userPosts.length, totalLikes:totalLikes });
  }
});
var top = Array.from(seen.values()).sort(function(a,b){ return b.totalLikes-a.totalLikes; }).slice(0,5);
var wrap = $('fsxSuggestedProfiles'); wrap.innerHTML = '';
top.forEach(function(u){
  var d = document.createElement('div'); d.className = 'fsx-profile-item';
  d.innerHTML = '<img src="https://ui-avatars.com/api/?name='+encodeURIComponent(u.name)+'&background=1e3a8a&color=fff"><div><h4>'+escapeHtml(u.name)+'</h4><span>'+u.postsCount+' posts · '+formatNum(u.totalLikes)+' likes</span></div>';
  d.addEventListener('click', function(){ showUserProfile(u.username, u.name); });
  wrap.appendChild(d);
});
}

function showOwnProfile(){ if (!currentUser || currentUser.isGuest){ alert('Please login to view your profile!'); return; } showUserProfile(currentUser.username, currentUser.name, true); }
function getMentionsForUser(username){ return DATABASEPOSTS.filter(function(post){ return post.content && post.content.indexOf('@'+username) > -1; }); }

function showUserProfile(username, name, isOwn){
var userPosts = DATABASEPOSTS.filter(function(p){ return p.username.toLowerCase() === username.toLowerCase(); });
if (!userPosts.length && !isOwn){ alert('User not found'); return; }
var totalLikes = userPosts.reduce(function(s,p){ return s+(p.likes||0); }, 0);
var mentions = getMentionsForUser(username);
var joined = 'Recently';
if (userPosts.length){ var sorted = userPosts.slice().sort(function(a,b){ return parseCustomDate(a.datePost)-parseCustomDate(b.datePost); }); joined = formatJoinedDate(parseCustomDate(sorted[0].datePost)); }
var avatar = 'https://ui-avatars.com/api/?name='+encodeURIComponent(name)+'&background=1e3a8a&color=fff&size=128';

$('fsxProfileModalName').textContent = name;
$('fsxProfileBody').innerHTML =
  '<div class="fsx-profile-hero"><img src="'+avatar+'"><h2>'+escapeHtml(name)+'</h2><div class="handle">@'+escapeHtml(username)+'</div>' +
  '<div style="font-size:0.78rem;color:var(--text-mute);margin-top:0.3rem;"><i class="fas fa-calendar-alt"></i> Joined '+joined+'</div></div>' +
  '<div class="fsx-profile-stats">' +
    '<div class="fsx-stat-box"><div class="val">'+userPosts.length+'</div><div class="lbl">Posts</div></div>' +
    '<div class="fsx-stat-box"><div class="val">'+formatNum(totalLikes)+'</div><div class="lbl">Likes</div></div>' +
    '<div class="fsx-stat-box"><div class="val">'+mentions.length+'</div><div class="lbl">Mentions</div></div>' +
  '</div>' +
  '<div class="fsx-profile-tabs">' +
    '<button class="fsx-profile-tab active" data-t="posts">Posts</button>' +
    '<button class="fsx-profile-tab" data-t="mentions">Mentions</button>' +
    (isOwn ? '<button class="fsx-profile-tab" data-t="liked">Liked</button>' : '') +
  '</div>' +
  '<div class="fsx-tab-content active" id="fsxTabPosts"></div>' +
  '<div class="fsx-tab-content" id="fsxTabMentions"></div>' +
  (isOwn ? '<div class="fsx-tab-content" id="fsxTabLiked"></div>' : '');

var postsTab = $('fsxTabPosts');
if (userPosts.length) userPosts.slice().sort(function(a,b){ return parseCustomDate(b.datePost)-parseCustomDate(a.datePost); }).forEach(function(p){ postsTab.appendChild(createPostCard(p, p.id)); });
else postsTab.innerHTML = '<div class="fsx-empty-state"><i class="fas fa-newspaper"></i><h3>No posts yet</h3></div>';

var mentionsTab = $('fsxTabMentions');
if (mentions.length) mentions.forEach(function(p){ mentionsTab.appendChild(createPostCard(p, p.id)); });
else mentionsTab.innerHTML = '<div class="fsx-empty-state"><i class="fas fa-at"></i><h3>No mentions yet</h3></div>';

if (isOwn){
  var likedTab = $('fsxTabLiked');
  var likedIds = Array.from(currentUser.likedPosts || []);
  var likedObjs = likedIds.map(function(id){ return DATABASEPOSTS.find(function(p){ return p.id === id; }); }).filter(Boolean);
  if (likedObjs.length) likedObjs.forEach(function(p){ likedTab.appendChild(createPostCard(p, p.id)); });
  else likedTab.innerHTML = '<div class="fsx-empty-state"><i class="fas fa-heart"></i><h3>No liked posts yet</h3></div>';
}

$('fsxProfileBody').querySelectorAll('.fsx-profile-tab').forEach(function(tab){
  tab.addEventListener('click', function(){
    $('fsxProfileBody').querySelectorAll('.fsx-profile-tab').forEach(function(t){ t.classList.remove('active'); });
    tab.classList.add('active');
    $('fsxProfileBody').querySelectorAll('.fsx-tab-content').forEach(function(c){ c.classList.remove('active'); });
    $('fsxTab' + tab.dataset.t.charAt(0).toUpperCase() + tab.dataset.t.slice(1)).classList.add('active');
  });
});
$('fsxProfileOverlay').classList.add('active');
}

$('fsxCloseProfile').addEventListener('click', function(){ $('fsxProfileOverlay').classList.remove('active'); });
$('fsxProfileOverlay').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('active'); });

function showSharedPostModal(post){
$('fsxProfileModalName').textContent = 'Shared Post';
$('fsxProfileBody').innerHTML = '<div id="fsxSharedPostSlot"></div><div style="margin-top:1rem;"><a href="#" id="fsxSharedViewInFeed" class="btn btn-secondary btn-block">View full profile</a></div>';
$('fsxSharedPostSlot').appendChild(createPostCard(post, post.id));
$('fsxSharedViewInFeed').addEventListener('click', function(e){ e.preventDefault(); $('fsxProfileOverlay').classList.remove('active'); showUserProfile(post.username, post.name); });
$('fsxProfileOverlay').classList.add('active');
}

function encodeShareParam(postId){
var raw = '/post/orgin/' + postId + '/content';
if (HASH_SHARE_LINKS){ try { return 'h:' + btoa(raw); } catch(e){ return raw; } }
return raw;
}

function decodeShareParam(value){
if (!value) return null;
if (value.indexOf('h:') === 0){ try { return atob(value.slice(2)); } catch(e){ return null; } }
return value;
}

function generateShareUrl(postId){ return location.origin + location.pathname + '?share=' + encodeURIComponent(encodeShareParam(postId)); }

function openShareModal(post, postId){
currentShareId = postId;
$('fsxSharePreview').innerHTML =
  '<div class="row"><img src="https://ui-avatars.com/api/?name='+encodeURIComponent(post.name)+'&background=1e3a8a&color=fff"><div><h4>'+escapeHtml(post.name)+'</h4><span style="color:var(--text-mute);font-size:0.78rem;">@'+escapeHtml(post.username)+'</span></div></div>' +
  '<p>'+escapeHtml((post.content||'').substring(0,140))+'</p>';
$('fsxShareUrlInput').value = generateShareUrl(postId);
$('fsxCopyUrlBtn').textContent = 'Copy';
$('fsxShareOverlay').classList.add('active');
}

$('fsxCloseShare').addEventListener('click', function(){ $('fsxShareOverlay').classList.remove('active'); });
$('fsxShareOverlay').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('active'); });

$('fsxCopyUrlBtn').addEventListener('click', function(){
var input = $('fsxShareUrlInput'); input.select();
navigator.clipboard.writeText(input.value).then(function(){ $('fsxCopyUrlBtn').textContent = 'Copied!'; setTimeout(function(){ $('fsxCopyUrlBtn').textContent = 'Copy'; }, 2000); });
});

document.querySelectorAll('.fsx-platform-btn').forEach(function(btn){
btn.addEventListener('click', function(){
  var post = DATABASEPOSTS.find(function(p){ return p.id === currentShareId; }) || {};
  var url = $('fsxShareUrlInput').value;
  var text = 'Check out this post on FortSocket by @' + (post.username||'') + ': ';
  var eu = encodeURIComponent(url), et = encodeURIComponent(text);
  var platform = btn.dataset.platform, shareUrl = '';
  if (platform === 'whatsapp') shareUrl = 'https://wa.me/?text=' + et + eu;
  else if (platform === 'facebook') shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + eu;
  else if (platform === 'messenger') shareUrl = 'https://www.facebook.com/dialog/send?link=' + eu + '&app_id=&redirect_uri=' + eu;
  else if (platform === 'twitter') shareUrl = 'https://twitter.com/intent/tweet?text=' + et + '&url=' + eu;
  else if (platform === 'telegram') shareUrl = 'https://t.me/share/url?url=' + eu + '&text=' + et;
  if (shareUrl) window.open(shareUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
});
});

function openReportModal(post){
reportTargetPost = post;
$('fsxReportNote').value = '';
document.querySelectorAll('input[name="fsxReportReason"]').forEach(function(r){ r.checked = false; });
$('fsxReportOverlay').classList.add('active');
}

$('fsxCloseReport').addEventListener('click', function(){ $('fsxReportOverlay').classList.remove('active'); });
$('fsxReportOverlay').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('active'); });

$('fsxSubmitReportBtn').addEventListener('click', function(){
if (!reportTargetPost) return;
var reasonEl = document.querySelector('input[name="fsxReportReason"]:checked');
if (!reasonEl){ alert('Please choose a reason'); return; }
var payload = {
  _subject: 'FortSocket report: ' + reportTargetPost.id,
  reported_post_id: reportTargetPost.id,
  reason: reasonEl.value,
  note: $('fsxReportNote').value.trim(),
  reported_by: (currentUser && currentUser.username) || 'guest',
  post_json: JSON.stringify(reportTargetPost)
};
var btn = $('fsxSubmitReportBtn'); btn.disabled = true; btn.textContent = 'Sending...';
fetch(REPORT_ENDPOINT, { method:'POST', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' }, body: JSON.stringify(payload) })
  .then(function(){ btn.textContent = 'Reported'; setTimeout(function(){ $('fsxReportOverlay').classList.remove('active'); btn.disabled = false; btn.textContent = 'Submit Report'; }, 1200); })
  .catch(function(){ btn.disabled = false; btn.textContent = 'Submit Report'; alert('Could not send the report right now — please try again in a moment.'); });
});

function toYouTubeEmbed(url){ var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/); return m ? 'https://www.youtube.com/embed/'+m[1] : url; }

document.querySelectorAll('.fsx-type-tab').forEach(function(tab){
tab.addEventListener('click', function(){
  document.querySelectorAll('.fsx-type-tab').forEach(function(t){ t.classList.remove('active'); });
  tab.classList.add('active');
  cpType = tab.dataset.type;
  var urlInput = $('fsxCPUrl');
  var placeholders = { text:'This post is text only', image:'Paste an image URL (https://...)', video:'Paste a direct video URL (.mp4, .webm)', iframe:'Paste a YouTube URL or embed link', audio:'Paste a direct MP3 URL (beta)' };
  urlInput.placeholder = placeholders[cpType];
  urlInput.disabled = cpType === 'text';
  urlInput.value = '';
  updateCPPreview();
});
});

$('fsxCPUrl').addEventListener('input', updateCPPreview);

function updateCPPreview(){
var box = $('fsxCPPreview'); var url = $('fsxCPUrl').value.trim();
if (cpType === 'text' || !url){ box.innerHTML = '<div class="fsx-preview-empty">'+(cpType==='text' ? 'No media for text-only posts.' : 'Paste a link above to preview it here.')+'</div>'; return; }
if (cpType === 'image') box.innerHTML = '<img src="'+url+'" onerror="this.parentElement.innerHTML=\'<div class=\\\'fsx-preview-empty\\\'>Could not load that image</div>\'">';
else if (cpType === 'video') box.innerHTML = '<video src="'+url+'" controls></video>';
else if (cpType === 'iframe') box.innerHTML = '<iframe src="'+toYouTubeEmbed(url)+'" allowfullscreen></iframe>';
else if (cpType === 'audio') box.innerHTML = '<audio src="'+url+'" controls></audio>';
}

function resetCreatePost(){
cpType = 'text';
document.querySelectorAll('.fsx-type-tab').forEach(function(t,i){ t.classList.toggle('active', i===0); });
$('fsxCPContent').value = ''; $('fsxCPUrl').value = ''; $('fsxCPUrl').disabled = true; $('fsxCPUrl').placeholder = 'This post is text only'; $('fsxCPTopic').value = '';
updateCPPreview();
}

$('fsxCreateTrigger').addEventListener('click', function(){ if (!currentUser || currentUser.isGuest){ alert('Please login to post!'); return; } resetCreatePost(); $('fsxCreatePostOverlay').classList.add('active'); });
$('fsxCloseCreatePost').addEventListener('click', function(){ $('fsxCreatePostOverlay').classList.remove('active'); });
$('fsxCreatePostOverlay').addEventListener('click', function(e){ if (e.target === this) this.classList.remove('active'); });

$('fsxCPSubmit').addEventListener('click', function(){
if (!currentUser || currentUser.isGuest){ alert('Please login to post!'); return; }
var content = $('fsxCPContent').value.trim();
var url = $('fsxCPUrl').value.trim();
var topic = $('fsxCPTopic').value.trim();
if (cpType === 'text' && !content){ alert('Write something first.'); return; }
if (cpType !== 'text' && !url){ alert('Paste a link for this post type.'); return; }

var newPost = { name: currentUser.name, username: currentUser.username, content: content, topic: topic, likes: 0, datePost: formatNowAsCustom() };
if (cpType === 'image') newPost.image = url;
if (cpType === 'video') newPost.video = url;
if (cpType === 'iframe') newPost.iframe = toYouTubeEmbed(url);
if (cpType === 'audio') newPost.audio = url;
newPost.id = 'sb-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

DATABASEPOSTS.unshift(newPost);
allPosts.unshift(newPost);
if (isVideoEligible(newPost)) videoPosts.unshift(newPost);

$('fsxPostsFeed').prepend(createPostCard(newPost, newPost.id));
displayedPosts.add(newPost.id);
loadTrendingTopics();
insertPostToSupabase(newPost);

$('fsxCreatePostOverlay').classList.remove('active');
});

function affinityKey(){ return 'fsx-affinity-' + ((currentUser && currentUser.username) || 'guest'); }
function loadAffinity(){ try { return JSON.parse(localStorage.getItem(affinityKey())) || {}; } catch(e){ return {}; } }
function saveAffinity(map){ try { localStorage.setItem(affinityKey(), JSON.stringify(map)); } catch(e){} }
function bumpAffinity(topic, amount){ if (!topic) return; var map = loadAffinity(); map[topic] = (map[topic]||0) + amount; saveAffinity(map); }

function recordWatchProgress(post, ratio){
if (!post || ratio < 0.7 || watchedThisSession.has(post.id)) return;
watchedThisSession.add(post.id);
if (post.topic) bumpAffinity(post.topic, 1);
}

function orderVideosByRecommendation(list){
var affinity = loadAffinity();
var likedTopics = {};
if (currentUser && currentUser.likedPosts){
  currentUser.likedPosts.forEach(function(id){
    var p = DATABASEPOSTS.find(function(x){ return x.id === id; });
    if (p && p.topic) likedTopics[p.topic] = (likedTopics[p.topic]||0) + 2;
  });
}
return list.map(function(post){
  var score = Math.random() * 1.5;
  if (post.topic){ score += (affinity[post.topic]||0) * 1.2; score += (likedTopics[post.topic]||0); }
  if (watchedThisSession.has(post.id)) score -= 4;
  score += Math.log((post.likes||0)+1) * 0.25;
  return { post: post, score: score };
}).sort(function(a,b){ return b.score - a.score; }).map(function(x){ return x.post; });
}

function openReels(){
document.querySelectorAll('.fsx-feed-video-wrap video').forEach(function(v){ v.pause(); });
launchReels(orderVideosByRecommendation(videoPosts), 0);
}

function openReelsAt(postId, resumeTime){
var clicked = videoPosts.find(function(p){ return p.id === postId; });
if (!clicked){
  console.log("Video Not Found")
  return;
}
var rest = orderVideosByRecommendation(videoPosts.filter(function(p){ return p.id !== postId; }));
document.querySelectorAll('.fsx-feed-video-wrap video').forEach(function(v){ v.pause(); });
launchReels([clicked].concat(rest), resumeTime || 0);
}

function launchReels(list, resumeTime){
setActiveNav('videos');
$('fsxReelsView').classList.add('active');
document.body.style.overflow = 'hidden';
document.querySelectorAll('.fsx-feed-video-wrap video').forEach(function(v){ 
  v.pause();
  v.muted = isMuted;
});
renderReelsFeed(list, resumeTime);
}

function closeReels(){
$('fsxReelsView').classList.remove('active');
document.body.style.overflow = '';
document.querySelectorAll('.fsx-reel-media-wrap video').forEach(function(v){ 
  v.pause(); 
});
//setActiveNav('home');
location.reload();
if(lastFeedVideo){
  lastFeedVideo.currentTime = lastFeedTime;
  lastFeedVideo.muted = isMuted;
  feedVideoObserver.unobserve(lastFeedVideo);
  feedVideoObserver.observe(lastFeedVideo);
  var rect = lastFeedVideo.getBoundingClientRect();
  var isVisible = rect.top < window.innerHeight && rect.bottom > 0;
  if(isVisible){
    lastFeedVideo.play().catch(function(){});
  }
  lastFeedVideo = null;
  lastFeedTime = 0;
}
}

$('fsxReelClose').addEventListener('click', closeReels);

function renderReelsFeed(list, resumeTime){
activeReelList = list;
var feed = $('fsxReelsFeed'); feed.innerHTML = ''; reelRenderedIdx.clear();
if (!activeReelList.length){
  feed.innerHTML = '<div class="fsx-reel-empty"><i class="fas fa-film" style="font-size:2.4rem;opacity:0.5;"></i><h3 style="color:#fff;">No videos yet</h3><p>Check back later for new video posts.</p></div>';
  return;
}
var limit = Math.min(4, activeReelList.length);
for (var i=0; i<limit; i++) renderReelCard(i);
setupReelObserver();
if (resumeTime){
  var v0 = $('fsxReelVid0');
  if (v0){
    if (v0.readyState >= 1) v0.currentTime = resumeTime;
    else v0.addEventListener('loadedmetadata', function once(){ v0.currentTime = resumeTime; v0.removeEventListener('loadedmetadata', once); });
  }
}
}

function reelMediaHtml(post, index){
if (post.video){
  return '<div class="fsx-reel-media-wrap" style="display:flex; align-items:center; justify-content:center; background:#000; width:100%; height:100%;"><video id="fsxReelVid'+index+'" src="'+post.video+'" loop playsinline preload="metadata" muted oncontextmenu="return false;" controlsList="nodownload" style="max-width:100%; max-height:100%; object-fit:contain;"></video></div>';
}
if (post.iframe){
  var src = post.iframe;
  if (src.indexOf('youtube.com/embed') > -1 || src.indexOf('youtu.be') > -1){
    var sep = src.indexOf('?') > -1 ? '&' : '?';
    src = src + sep + 'autoplay=0&mute=1&loop=1&controls=0&playsinline=1';
  }
  return '<div class="fsx-reel-media-wrap" style="display:flex; align-items:center; justify-content:center; background:#000; width:100%; height:100%;"><iframe id="fsxReelIframe'+index+'" data-src="'+src+'" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%;"></iframe></div>';
}
return '';
}

function renderReelCard(index){
if (reelRenderedIdx.has(index)) return;
reelRenderedIdx.add(index);
var post = activeReelList[index]; if (!post) return;
var card = document.createElement('div');
card.className = 'fsx-reel-card';
card.dataset.index = index;
var isLiked = currentUser && currentUser.likedPosts && currentUser.likedPosts.has(post.id);
var avatar = 'https://ui-avatars.com/api/?name='+encodeURIComponent(post.name)+'&background=1e3a8a&color=fff';
var caption = (post.content||'').replace(/@(\w+)/g, function(m,u){ return '<span class="mention" data-username="'+u+'" style="color:#5eead4;cursor:pointer;">@'+u+'</span>'; });

card.innerHTML =
  reelMediaHtml(post, index) +
  '<div class="fsx-reel-gradient-top"></div><div class="fsx-reel-gradient-bottom"></div>' +
  '<div class="fsx-reel-pause-icon" id="fsxReelPause'+index+'"><i class="fas fa-pause"></i></div>' +
  '<div class="fsx-reel-info">' +
    '<div class="fsx-reel-user" data-username="'+escapeHtml(post.username)+'"><img src="'+avatar+'"><div><h4>'+escapeHtml(post.name)+'</h4><span>@'+escapeHtml(post.username)+'</span></div></div>' +
    (caption ? '<div class="fsx-reel-caption">'+caption+'</div>' : '') +
    (post.topic ? '<div style="margin-top:0.4rem;font-size:0.76rem;color:#5eead4;"><i class="fas fa-hashtag"></i> '+escapeHtml(post.topic)+'</div>' : '') +
  '</div>' +
  '<div class="fsx-reel-actions">' +
    '<div class="fsx-reel-action'+(isLiked?' liked':'')+'" data-action="like"><div class="circle"><i class="fas fa-heart"></i></div><span class="lbl">'+formatNum(post.likes)+'</span></div>' +
    '<div class="fsx-reel-action" data-action="share"><div class="circle"><i class="fas fa-share-alt"></i></div><span class="lbl">Share</span></div>' +
    '<div class="fsx-reel-action" data-action="report"><div class="circle"><i class="fas fa-flag"></i></div><span class="lbl">Report</span></div>' +
    '<div class="fsx-reel-action" data-action="profile"><div class="circle"><i class="fas fa-user"></i></div><span class="lbl">Profile</span></div>' +
  '</div>' +
  '<div class="fsx-reel-progress"><div class="fsx-reel-progress-fill" id="fsxReelProg'+index+'"></div></div>';

$('fsxReelsFeed').appendChild(card);
bindReelCard(card, index, post);
}

function bindReelCard(card, index, post){
card.querySelector('.fsx-reel-user').addEventListener('click', function(){ openReelProfile(post.username, post.name); });
card.querySelector('[data-action="profile"]').addEventListener('click', function(){ openReelProfile(post.username, post.name); });

var likeEl = card.querySelector('[data-action="like"]');
likeEl.addEventListener('click', function(e){ e.stopPropagation(); handleReelLike(post, likeEl); });

card.querySelector('[data-action="share"]').addEventListener('click', function(e){ e.stopPropagation(); openShareModal(post, post.id); });
card.querySelector('[data-action="report"]').addEventListener('click', function(e){ e.stopPropagation(); openReportModal(post); });

card.querySelectorAll('.mention').forEach(function(m){
  m.addEventListener('click', function(e){ e.stopPropagation(); var uname = m.dataset.username; if (DATABASEPOSTS.some(function(p){ return p.username===uname; })) openReelProfile(uname, uname); });
});

var tapCount = 0, tapTimer = null;
card.addEventListener('click', function(e){
  if (e.target.closest('.fsx-reel-actions, .fsx-reel-info, [data-action], .mention')) return;
  tapCount++;
  if (tapCount === 1) tapTimer = setTimeout(function(){ tapCount = 0; toggleReelPlay(index); }, 220);
  else if (tapCount === 2){ clearTimeout(tapTimer); tapCount = 0; doubleTapLike(post, card, likeEl); }
});
}

function openReelProfile(username, name){ closeReels(); showUserProfile(username, name); }

function toggleReelPlay(index){
var vid = $('fsxReelVid' + index); if (!vid) return;
if (vid.paused){ vid.play().catch(function(){}); showReelIcon(index, 'pause'); } else { vid.pause(); showReelIcon(index, 'play'); }
}

function showReelIcon(index, type){
var el = $('fsxReelPause' + index); if (!el) return;
clearTimeout(reelIconTimers[index]);
el.querySelector('i').className = type === 'pause' ? 'fas fa-pause' : 'fas fa-play';
el.classList.add('show');
reelIconTimers[index] = setTimeout(function(){ el.classList.remove('show'); }, type === 'play' ? 800 : 500);
}

function doubleTapLike(post, card, likeEl){
var heart = document.createElement('div'); heart.className = 'fsx-dt-heart'; heart.textContent = '❤️';
card.appendChild(heart); setTimeout(function(){ heart.remove(); }, 800);
if (!currentUser || !currentUser.likedPosts || !currentUser.likedPosts.has(post.id)) handleReelLike(post, likeEl);
}

function handleReelLike(post, likeEl){
if (!currentUser || currentUser.isGuest){ showReelToast('Login to like videos!'); return; }
if (!currentUser.likedPosts) currentUser.likedPosts = new Set();
var liked = currentUser.likedPosts.has(post.id);
var countEl = likeEl.querySelector('.lbl');
if (liked){ currentUser.likedPosts.delete(post.id); post.likes = Math.max(0,(post.likes||0)-1); likeEl.classList.remove('liked'); }
else { currentUser.likedPosts.add(post.id); post.likes = (post.likes||0)+1; likeEl.classList.add('liked'); if (post.topic) bumpAffinity(post.topic, 2); }
if (countEl) countEl.textContent = formatNum(post.likes);
saveCurrentUser();
}

function showReelToast(msg){
var t = document.createElement('div'); t.textContent = msg;
t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 18px;border-radius:50px;font-size:0.82rem;z-index:999;';
document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2200);
}

function setupReelObserver(){
if (reelObserver) reelObserver.disconnect();
reelObserver = new IntersectionObserver(function(entries){
  entries.forEach(function(entry){
    var card = entry.target;
    var index = parseInt(card.dataset.index);
    var vid = $('fsxReelVid' + index);
    if (entry.isIntersecting && entry.intersectionRatio >= 0.7){
      currentReelIndex = index;
      if (vid){
        vid.muted = isMuted;
        vid.play().catch(function(){});
        vid.ontimeupdate = function(){
          var prog = $('fsxReelProg' + index);
          if (prog && vid.duration) prog.style.width = (vid.currentTime/vid.duration*100)+'%';
          if (vid.duration) recordWatchProgress(activeReelList[index], vid.currentTime/vid.duration);
        };
      } else {
        var iframe = $('fsxReelIframe' + index);
        if (iframe && !iframe.src) iframe.src = iframe.dataset.src.replace('autoplay=0','autoplay=1');
      }
      for (var ahead=1; ahead<=3; ahead++){
        var ni = index+ahead;
        if (ni < activeReelList.length && !reelRenderedIdx.has(ni)) renderReelCard(ni);
      }
      var nextVid = $('fsxReelVid' + (index+1));
      if (nextVid) nextVid.preload = 'auto';
      document.querySelectorAll('.fsx-reel-card').forEach(function(c){ reelObserver.observe(c); });
    } else {
      if (vid && !vid.paused) vid.pause();
      var iframeOff = $('fsxReelIframe' + index);
      if (iframeOff) iframeOff.src = '';
    }
  });
}, { threshold: 0.7, rootMargin: '100% 0px' });
document.querySelectorAll('.fsx-reel-card').forEach(function(c){ reelObserver.observe(c); });
}

function processUrlParameters(){
var params = new URLSearchParams(window.location.search);
var share = params.get('share');
if (!share) return;
var raw = decodeShareParam(decodeURIComponent(share));
if (!raw) return;
var parts = raw.split('/').filter(Boolean);
var postId = parts[2];
var check = setInterval(function(){
  if (DATABASEPOSTS.length){
    clearInterval(check);
    var post = DATABASEPOSTS.find(function(p){ return p.id === postId; });
    if (post){
      if (isVideoEligible(post)) openReelsAt(postId, 0);
      else showSharedPostModal(post);
    }
    history.replaceState(null, '', window.location.pathname);
  }
}, 150);
setTimeout(function(){ clearInterval(check); }, 6000);
}

function init(){
initSupabase();
checkAuth();
fetchPosts();
processUrlParameters();
loadSearchHistory();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();