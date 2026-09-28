
// ===== Duka.cu shared app logic =====
// Loaded by every page (index/account/cart/sell). Holds the data model,
// the resilient storage layer, and the bits of the header (cart badge,
// account name) that appear on every page.

const DEFAULT_LISTINGS = [
  {id:'l1', title:'MacBook Air M1 (8GB / 256GB) — Excellent Condition', category:'electronics', price:450000, condition:'Excellent', description:"Barely used, mostly for lectures and light editing. Battery health is at 91% and it comes with the original charger and box. No scratches on the lid or trackpad.", verified:true, sellerName:'Ayo', sellerLevel:'200L', image:'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 803 210 4477', snap:'ayo_deals200', email:'ayo.o.20034521@stu.cu.edu.ng', createdAt:14, sold:34},
  {id:'l2', title:'Rechargeable LED Desk Lamp', category:'hostel', price:8500, condition:'Good', description:"Three brightness settings and a USB-C port for charging. Great for late-night reading without waking your roommate. Selling because I'm switching to a wall-mounted one.", verified:false, sellerName:'Tolu', sellerLevel:'400L', image:'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 810 552 9903', snap:'tolu_hostel', email:'tolu.a.19087765@stu.cu.edu.ng', createdAt:13, sold:12},
  {id:'l3', title:'Sony WH-1000XM4 Noise Cancelling', category:'audio', price:120000, condition:'Excellent', description:"Industry-leading noise cancellation, perfect for the library or a noisy hostel. Comes with the carry case and both cables. Selling to upgrade to over-ear studio monitors.", verified:true, sellerName:'David', sellerLevel:'300L', image:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 706 118 2290', snap:'dave_audio300', email:'david.o.20112233@stu.cu.edu.ng', createdAt:12, sold:21},
  {id:'l4', title:'Canon EOS Rebel T7 DSLR Kit', category:'photography', price:210000, condition:'Good', description:"Includes the 18-55mm kit lens, a 32GB SD card, and a shoulder bag. Great starter camera for event coverage gigs around campus. Shutter count is under 8,000.", verified:true, sellerName:'Grace', sellerLevel:'100L', image:'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 902 447 6810', snap:'grace_lens', email:'grace.n.20245567@stu.cu.edu.ng', createdAt:11, sold:8},
  {id:'l5', title:'Jollof Rice & Chicken Pack', category:'food', price:2000, condition:'Freshly made', description:"Made to order — smoky party-style jollof with a full quarter chicken and coleslaw on the side. Orders placed before 12pm are ready for evening pickup or Duka delivery.", verified:true, sellerName:'Blessing', sellerLevel:'200L', image:'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 814 220 6631', snap:'blessings_kitchen', email:'blessing.a.20198810@stu.cu.edu.ng', createdAt:10, sold:120},
  {id:'l6', title:'Beef Suya (10 sticks)', category:'food', price:3500, condition:'Freshly made', description:"Grilled fresh every evening with extra yaji spice on request. Wrapped hot and ready for pickup near the main gate, or add Duka delivery straight to your hostel.", verified:true, sellerName:'Kunle', sellerLevel:'300L', image:'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 705 831 4402', snap:'kunle_suyaspot', email:'kunle.o.20176652@stu.cu.edu.ng', createdAt:9, sold:98},
  {id:'l7', title:'Amala & Ewedu Swallow Pack', category:'food', price:1500, condition:'Freshly made', description:"Smooth amala with ewedu and a rich gbegiri blend, packed to travel well. A campus favourite for lunch between back-to-back classes.", verified:false, sellerName:'Faith', sellerLevel:'400L', image:'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 813 990 2217', snap:'faiths_amala', email:'faith.o.20209934@stu.cu.edu.ng', createdAt:8, sold:41},
  {id:'l8', title:'MTH 101 & PHY 101 Past Questions + Textbooks Bundle', category:'books', price:6000, condition:'Good', description:"Two years of solved past questions plus the recommended textbooks for both courses, lightly highlighted. Saved me a lot of time before exams — hoping it does the same for you.", verified:true, sellerName:'Miracle', sellerLevel:'200L', image:'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 812 004 5521', snap:'miracle_reads', email:'miracle.e.20233310@stu.cu.edu.ng', createdAt:7, sold:19},
  {id:'l9', title:'Engineering Drawing Set + Scientific Calculator', category:'books', price:4500, condition:'Like new', description:"Complete drawing set with compass, set squares, and protractor, plus a Casio fx-991 calculator. Used for one semester only, no missing pieces.", verified:false, sellerName:'Chidi', sellerLevel:'100L', image:'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 705 662 9981', snap:'chidi_draws', email:'chidi.n.20256689@stu.cu.edu.ng', createdAt:6, sold:5},
  {id:'l10', title:'CU Approved Hoodie — Navy, Size M', category:'fashion', price:9500, condition:'Excellent', description:"Official CU-branded hoodie, worn a handful of times. Thick fleece lining, holds up well through the harmattan season. True to size for a regular fit.", verified:true, sellerName:'Zainab', sellerLevel:'300L', image:'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 809 774 2210', snap:'zee_wears', email:'zainab.m.20187744@stu.cu.edu.ng', createdAt:5, sold:27},
  {id:'l11', title:'Corporate Wear Bundle — 2 Shirts + 1 Trouser', category:'fashion', price:15000, condition:'Good', description:"Perfect for entrepreneurship presentations, internship interviews, or chapel. Slim fit, size 32 waist. Dry-cleaned and ready to wear.", verified:false, sellerName:'Emeka', sellerLevel:'400L', image:'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 703 118 6602', snap:'emeka_fits', email:'emeka.a.19099234@stu.cu.edu.ng', createdAt:4, sold:9},
  {id:'l12', title:'Portable Bluetooth Speaker (JBL Clip 4 style)', category:'audio', price:18000, condition:'Like new', description:"Loud, waterproof, and small enough to clip onto a bag. Used for a couple of hall socials only. Comes with the charging cable.", verified:false, sellerName:'Tobi', sellerLevel:'200L', image:'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 816 552 3390', snap:'tobi_sounds', email:'tobi.s.20211123@stu.cu.edu.ng', createdAt:3, sold:15},
  {id:'l13', title:'Mini Fridge (Hostel-Friendly, 45L)', category:'hostel', price:65000, condition:'Good', description:"Keeps drinks and leftovers cold without drawing too much power. Quiet compressor, ideal for a shared room. Selling because I'm graduating this semester.", verified:true, sellerName:'Kelechi', sellerLevel:'400L', image:'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800&auto=format&fit=crop&q=60', delivery:'self', phone:'+234 802 447 9012', snap:'kc_hostellife', email:'kelechi.o.19076543@stu.cu.edu.ng', createdAt:2, sold:6},
  {id:'l14', title:'Skincare Starter Set (Cleanser, Toner, Moisturizer)', category:'beauty', price:12000, condition:'New, sealed', description:"Unopened set for combination skin, bought as a duplicate gift. Same routine dermatologists recommend for the harmattan dryness we get on campus.", verified:false, sellerName:'Amaka', sellerLevel:'200L', image:'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=60', delivery:'duka', phone:'+234 705 990 1187', snap:'amaka_glows', email:'amaka.c.20244421@stu.cu.edu.ng', createdAt:1, sold:23}
];

let listings = [];
let cart = [];       // {id, title, price, qty} — per-device
let account = {name:'', email:''}; // per-device

// ---------- storage layer ----------
// Tries window.storage first (only exists while previewed inside
// Claude.ai and gives true cross-tester sharing for shared=true keys).
// Falls back to the browser's own localStorage so the site still works
// once it's hosted as a real standalone site (window.storage won't
// exist there at all). Never throws — a broken storage call used to
// silently kill whatever button triggered it.
async function storageGet(key, shared){
  try{
    if (window.storage){
      const res = await window.storage.get(key, shared);
      return res ? res.value : null;
    }
  }catch(e){ /* fall through */ }
  try{ return localStorage.getItem((shared ? 'shared:' : 'local:') + key); }
  catch(e){ return null; }
}
async function storageSet(key, value, shared){
  try{
    if (window.storage){
      await window.storage.set(key, value, shared);
      return;
    }
  }catch(e){ /* fall through */ }
  try{ localStorage.setItem((shared ? 'shared:' : 'local:') + key, value); }
  catch(e){ /* nothing more we can do — app still works in-memory this session */ }
}

async function loadListings(){
  if (window.DukaApi && await DukaApi.health()) {
    try { const remote = await DukaApi.listings(); const byId = new Map(DEFAULT_LISTINGS.map(item => [item.id, item])); remote.forEach(item => byId.set(item.id, item)); listings = [...byId.values()]; return; }
    catch (e) { /* Use the offline catalogue below. */ }
  }
  const raw = await storageGet('duka-listings', true);
  if (raw){ try{ listings = JSON.parse(raw); return; }catch(e){ /* reseed below */ } }
  listings = DEFAULT_LISTINGS.slice();
  await storageSet('duka-listings', JSON.stringify(listings), true);
}
async function saveListings(){ await storageSet('duka-listings', JSON.stringify(listings), true); }

async function loadCart(){
  const raw = await storageGet('duka-cart', false);
  try{ cart = raw ? JSON.parse(raw) : []; }catch(e){ cart = []; }
}
async function saveCart(){ await storageSet('duka-cart', JSON.stringify(cart), false); }

async function loadAccount(){
  const raw = await storageGet('duka-account', false);
  try{ account = raw ? JSON.parse(raw) : {name:'', email:''}; }catch(e){ account = {name:'', email:''}; }
}
async function saveAccountData(){ await storageSet('duka-account', JSON.stringify(account), false); }

// ---------- shared helpers ----------
function money(n){ return '₦' + Number(n).toLocaleString('en-NG'); }
function imgFallback(img){
  if (!img || img.dataset.fallback === '1') return;
  img.dataset.fallback = '1';
  const place = document.createElement('div');
  place.className = img.closest('.pd_image_wrap') ? 'pd_img_placeholder' : 'img_placeholder';
  place.innerHTML = '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABY7SURBVHhexVoJVBRH/q7/vrfZJCLMMMzVwxWIJjEqimuyWTW7GjUxGpEk6mLifYFHoolx4y0eUdAEjAgeyI03UVSCJ6viEY+oSTR4RBBQDjlFhrvn+7+qnoGZnp4BfbrLe9+jp7q6u77vd9Svqps0Vd8hfHW2TTRJtD0NSN2Xtokh7iOGrT72rjc/R6gAtjo+S5ieaf5sMXn748qRaLMNW/eTbPxvQExSPMBnMS6pe0o2SqGt/VqDOWGp9qcNe/el51gIiE+05eK2nJeC2NJS95I631Y87rX/sxxgD7ZEsgfTNfaulRLZZudngbY+yx4JKbS1v1SfVlV7mkDDPYKm+wR1eQSN9xkMeuts/rjjeZy+Yth8mFTbkwA1dwn4AoKGfHLqeAqmTx2PDwYNxMSxAUjdHYMm/V2C2lyLcTytZ7cFT/1h5vejpKvLbpBt8Rsw8uNh8PL0wtRJExEZsQ5zZn+ODl4vY/ynI1FVeoMYjCKI7/esYXcWeBKYSKDxHrl4Nu1837d7Q+4oB6fmcPRQKoB6AI2gf9m3foFP5y6YOmE0eBoWfKHgLXV5kveV8hDxsXmftgj6TGYBSiB41dI3fLp0wXB/P7zaoSOCFy9gpOv0D3Dpp5OIigjDV1/OQq+/vQW1Ug3/D97HF58FIj46HIcObp/DcoRRiLaMTyzOYwjQto5tRw5LboGTxuLd/v1wLH03XDlXZBw9iC2bIvFO377QaXVQyBVwcXYBp9bCldNBqVBCIVMwdPDyxuyZU/Dmu+970MRpum8LhGdJjdvER+qcFOxe0KJm272EWi3y+7V93V3dkXFoN+Kj10GpUKG7TzdGWKNUw41zhbvODa5aHfst/NdAq9KwY6ULh/YOcrzZsycyju1di/p8KwHMx20+Nqk2W6B9mg/EJ8UdW+tjApoKSOqeWJbwzp48iMHvDoBKoWKW5jQclM4uULuoGPGur3fBpwEB8HBzZ6HQrasP3LRavP9XDr26uMFD7cxCo/5RDjHo7zYL0EzyEQU1jgkmY5mOrccnbm+TdcUX2QNNZBvCv4FWrWUJjhLXaThm2W5dfPDVF19g9KhR+Gt3X8yaOR1Xfz6LsLUh2BwVgbSDBzCityv2fKZF1AQttkzUoIObCj+mJoMKa+kFRiEsBBDAi343CybBxaYAUp1bRw4BiknIioVwdnKGp6sbPHRuRssrWQ6I+D4c6Qd+QOaJo9iXshPZt35D2v4UJCXEIik+GnNHvIblIzSY569D7FQOndydETRlImAosvACQQCTN4gJS0GaTysCWE6RUv3MyRtqcsmj8lvkvf794KbVwcvdE+6cK5sCVQolpkycgN3bE7EtMQaL5n+NkFUrMPi9QXit46vw9vRiXqJV66BWuRqhg1qpQc8eviCEPI/6e8JUWZsrEqFFCGEsYvJPKID42H6/HDa4pNj1ULuo4e3hCW93T8ED1BwLg86dXmdF0KCB77JcQEWhfU3n3TgdS470GgZXdwE6N/j6+GC4/1BErV+N8sJrBHU0MVKPENDE/osTpKUA1mNudRoUFLV93oQcwuvvEkNdPhnx0TDo1JwggIcnPF3dWT5gWZ9zZaFA53069dHZgBJ8yc0dXu4eDC+5ecJN5wFO4wYN9QAVx2YIOk3KnZzRvp0j+v2jD4ryrhBDLa0TjCLU0OmSVpNmSdKG1UUCSHuAqaPUDayRQ1CbR8oLrhFqKU+dO7O+p5snOK0HFAo617syF6ekqSiULO1DQUPFVecBtcod3m4c3u6iQX8fFXp3UuIVdxc4y10gl7mwaVTuJIfDi+3x06kDoPUGs74+j4CQ5/nKLGYIITRou3V5LebU7CLWpKw7t0DcP4e55J5dsaM7eHdgpLVad3T2dsWIPhze81VDpdRBo/aAK+cBd50Hs7JO6wG12h3uOlcM9NUifIwGN9ZogUQOSObY/9JILTIXauDjrYSDgwwdX34Za1ctZlMjr88lvD6PNFHiO98AX5gpeAIlTlF6qdkjxJxMv+14gDCdiMkKfSUEMBSTSxeOV7q7uuHDHhrsmKrB/fUckKRDQ5wO6f/mMHsIh2Fv6dDXh8OA7hzG9tNi3TgOl1do0RCjBZK1MMRrET1ZjRG9VIgNNImhwtzhryJldyIe5P9C0FRIDJQ8df3aAmI4v3QRv6c3hFDMI3xdIeFPz4Hh4FAwkUTVo0gA60aTAPa8w5w8jf1L5w4heOzbODpajooZcvCrXIAkDojXAQk6YAeHpjgdMhdpcec7Do1xVBwO2KYTSMZrgSQtTi/WIqCPGvP81fj0bTVur6XCqLE5qAMGjwl5BY20HmhJfnxdMeEzZ4E/OQN8fQnh64oIf3ou+OSu4ItOs/BokwBi8q0LYGrPIYb6QrJi+nBkj/kzqqc7oXSKDFXzFcyahnjqyjpkh3F4q5MK3q5KRo4JEM+x84Y4CsH6DTFUGA3qNsmBWCX4WPpbi32zVPjPsVQ0C0BjnVq35j7hs6IrQIgjX1tI+DNfgd/mC/7BeeYdNATMBRDDjKA5URNxyzaxAIJ4dPFTSMIXBOLO6BdQESRD6VQZKr5wBh8jEKSWnjZQjdlD1KiMpoKomNUZeREaYjWImdUNcRFLsXPZe6jcqGShcXGJM7bFrQf4IiP5u8RQk0dQd09w+doCwpf/RvijYwTy1DNqC0kTbWfeYk2+WQBLEcRE7YMJwBeRrd8vx88jX8DDaYIApdPlaNoseAC18NWVQjyfWdEBOxb8HZdXeYCPU1uQp4nvyFw1OFcvbI3egtLyEhxa/Q4Qp0DeGhnWr5oDNBU3k6+rvEN+PLBjNj021OQL8U8J0+Pis4S/EgrDkU/Al1xkSVE8dgpRCEgnPvvIYUlp364YHP3IAY+my1AaKEPJVCfUf6+GIUFwb2zXYt1oJYaPCMDN23/gwtkM/LrOB4hXG0OAA7ZzWD5Sgz//Rcamzfzc27h4JA4PNzhDHynH6jkjwdcVsATYqM8lYWuWY/XKYGyMWIOmWpr984RZoPQSMaT2B394JPjrG9FUddNmGEjE/+Mih6DhPjl9Kg07/BRCDqACTHZCTYgSSBASXFkUh9c8lHjuOQeM/fQTADxyzmxFQ7SLEP9UgG1aBA9X40UHF1bwHP4xFfk3z6GIziYxCqwK+geqK+geYj4pL/iNrAheCKAGmyPDcPHsoV+BUoKGAmKgY6r5gxhMoWGDPIWdJNcC63xgDqEGSDuctmyznzsaZjqiPIgKIEP1UhdBgEQO11YJ6wFazVHr5tz5HfzDLDQleMEQqxEESNIi5XMNXqACODji9KkMPLh1ElUb1UCiEuFTXse93Gv/R+O+tuIPsjJ4AdBYgpPHDmBL1Lf48cB2RK0PRfjaldi6MQxVpVmEr6FlslSiF9CGTG8vLIQMS5eqFSW3yKKhXZD2oQx3JspRHijDw3nCTIBELXLDtHDTKCFzdAan0SHnzg3g4W8wJHjAEGv0gHgtHm7SYICPAsP8P4a+qgj6/3wOfquCJcLYIA/8dPb4b9TjGqpySPCir4H6YvznaCpWr1yMc5npKC3IgqGpFCk743A0bbuxWhSPuw0CmLfZ9AC6pd1UQC6fP4wJY0ax+t5BrsGst5SoCnJCxWw5eEZOCz6Bw/h+avzpOTnGT5wKA90YvR4CJNB6QSfUBBQ7OFRv1kG/dzCw/x0gxugdyRz2f6nB8cN7AUMJOXtiP3N98GVo1N9HdXk2cm//jCsXMpC6Nxmh3yxBWPg3fehus9W4LQWwbhRIW0J8ntcLsb95wxrQ7S+680uXri/KtfDvomazQdk0JzRtNhKI16I0Qo29C3zx6EII8lKDkDTDDWeWaJG1hkNWKIdTiziEfKLFjEFaNGxRATHKlvyQxOHcIgV+2LkVQBUJXbUEhbnXAb4cGUf2IiEmEgdSd2La1EmgCZm6P12fsF0j8dgtBbBVCtsHtXzclnC4yIV9Pvpfp9FijK8KJ//ljEpaD0xxQsMGDcsDJhFonCPRGbGTZPjTXxTglCp4aZVQuijhKFPizy8oMaC7GjytION1MMTpYKDHiRxurlJg1eLZSNm5FePHjIKhrhhNtUX4NnQFah/mAajGgR+ScPX8Ieb6dg1obJd0/9ZANz73700MfOXlDmx/j67tg6ZMQPiqRbgyqh1qZhhngilOqF1Lix5KxFTxGZNiiBaBPV2RM64jssd1QJq/N3p7afBcOyU2T6blb0t/ViMkcKiI4tDZS43nn2+P7l19oK/MAwwVWB8eiv0pyYChDAkxEbhw6sBhqXcLUjDLAdZCWCrXcp5ufNAVGXV7mtkH9PsnGmoLkXFkHw76OaBqmmkqlKF6mdJKAKE61CJhCod0/5eBGa8Cs1/Flv4v4f03VKjeKhBu6S+sJ+q3cujVSQVHRwUc2rXHhnVrAFRifVgIygpvoLggC98sW4DK4uts+8yW5c05NQtg7Qm2Q8NQl0dGfOjHLE/3/kK/Wczm40sXTiDhAyUeTXNsrgWqFigEMuYlr3Ed0BSvxf4vOWwa7oa44R7YOo5D2SbB3S0Fo+EghJDfmxx0Ok+2QzR5whisDVmOWTODsHThXHwXugyXzqSdb6v1KSwEsOUJ5tMgfZtLy99BA/vD2UmO9i+2x8Rxn6Kw4CZDpL83HgW1ZwLQHFD5pVxYFFEREmg8m0TQArHCFNkQy0EfTfOD0fLNCySBPAM9jlVi5dTeSE8/GPyoJIug/j4pyb/KiqLGR/RFbK5xq0wYt7QBLTlKWF9KBKFN6Eez/z3mAX/t3h3RG8Nw5NAerF6xCJFR4Vjh9zqqgtqjLFCGsqkylM+Ugd+qEQRgZCw9gXkDFcOCtBlYIUWnSRoGLgiZ3BNV5dksw9NFDiNdQzdGWvYEzQWQToKtCiC+oOWGdPrTV9wi8+d+jvs5lwGUAnwxmmrykXkyHdPf74miSQ6sGmReEChDY6RxTWBOzEjOkqiwgcJAj6kwm9WoC3PGtXmOiJrshdgNy9FYY1rjiyE9ZqnwNh3b6GAb9DXVz+fSkRwXCaAEvD6vBY3F2JUQicyPjatCNhPIUBdGS1mj9U1ETUjQCkS3qIH1auhXq1E4T4GLEx2QOkKOTX5uWDmqDyJDFiLz1JEDtNanRrBHWgxzDxAb3Cz+TZ3si0Hd/3TGXuzdFccsbyJvqC9AcvxGjB/1MS4GtEfldDlKp8lZGNSHqIFknRDzGzUwhKlQsViGu5+3w6Vx7ZA01BHBfZUY76vCP71c4NfbFzti1uH4oRQcOZ4WXl1J645CJn7biIu9WtxuQwDrWLEGjb0j+7fP+f7blbQkZeRRX8BC4cyJA/ho2FCcC3CCfroDHgS+iOwJL+C3SXIcGeOCLUNcsLCPEgFdXDDvX/2xYcln2B4dhnXfrYZMwUGu0MJZoYa3d0dErF/XD3jAag7xGyF7IrTwMRG1nM3Ewtggb6mSJXJIU20uCVm5GNevnGTEb18/i/y7V7FhXQgSYyOwZHBHrAvoitApgxC17DOMHDIQznIlI9jOUQnfHj1RVnyDbaQyNBWQgBEfwlmmYK/RZI5yzP1iOqjVrUnbF0CKpNAmfWzD6i3qtfxuOU8XGIQQp5VL5yHi+zWY/VkgqCAnj6aAvqwIDl3/9wdFN4iBLyZnMg+ldXqtE1QuavaCxFnmjF1JG0GLKRMRKsDp4/ugUWlYH1pa028E9qfETxLmdDFx+wJIQZpnswDWigkQC9FyMxoKdO49cWjn8sqi64RuVrKPGegKkX4NhgeEfuDQ629vQiF3AafRMsuODhiOpppcC7dmx7X5hL76Yl6gFvouX/Jv9lKUfmjFNjlq84R7U9TY3ucTwxZ5CqukYA1b5+jAhUHRl6LN1qy/R/RlN8nJ43vx3oB+bAOEujV9q+PTuTPiYjcNpX0sLUmX1YXk4A8JcHFWMi9QuajQvWtX+lK0XXXZTZYLls3/2vfUsRScOroHD/KvGJOieFyPB9EM8LiwdEm6PKZvcf2GDGKWpF+GUPLUtV9y90TGoV0245qKqC+/TXq/9Tf2HpB6Ab3ujR49MPCdfvjYfyg83T3Qo7sv5nwxE8uXzENmxj7QL9Gsx2WCufFavFmUA+wLYO+cAJPl80nxvV/IwHf6MvelVmTxrNKw93lLF84BUGRF3EJAQzFZvXwhu54KQK+bPH40vp4zi70PXLF0PipK/mDLXrryo7U/IURBxWt9nC2zgznnVgVoHYL1qstvkWEfDIKsvZxZnX4Wo1Vp8WrHjnDj3DD2kxFgLmtRxAgQni+U2JfPHbpDN1ioF3Tr0gWH0/bAy/MlxGwKB/AQ4EuQcfgHzP/3bAz3H4Yf9yU2r/2tx9ZiQPq/zQKIf9sHfTOUT5JiIzBx7Kcs4dFVInXbpPhN2J4cjbWrg0FLZ6nPXAQBjB7QcI9VmR5uHpC1l2H1yiWYHjgJ9IszuuytLPsDM4ImM3GdHJzYjHLxdBrodVJjlmoTw6hMC9p6YUu/HEI/d6V79A8f3AJdJTo6OOG1jq8gbM1K7Ejeio2RYfgkYCSbJmlWl/ICJoChiISFBsPJQca+IfAbMph5QX72FZQU3YTf4EFwai9joUX/zwicgCa2KLJ8AywFc37msPIAsRj2YBKAuuCu5E34KTMd2bcuoevrnZmF+vT6Oz70+wDBi79GxLoQrFg6D3t2RKOJTWESAjQVsPvQmYN+SEG/JaS7u6VFtzBoQH+2AWMiP+IjP1Q+yGIfSbR1rFL9JE88nicYvw0qu0lWLP2aJalrVzPR07cHxo0OQEXJbQBlxlXjA+zeFo2Mw7tZ3NL5n9UARphyALX+Kx064mh6CgryrmFA33+yhEj3Han7z5kVBPo8uvZvbdOzNR6PZXFJsK2nHMLX5pILp1JTly36CoX3fkd1RTbqq3LZihENhUBjEROhoigLkeErUVtxk1Q/uEb0JdcZakp/J3XlN0hJ3mUSMPxDZN/6GZcvZKBHt2548XkH5hF06y39wDb2hti08UEFME13phJYzMX8t/hcc+MTiaDPIQ8LfiGZ+zfPunA4cc2J7d+NvnB8J5Yv/BIJMRtw+sQBXLlwDFcvHMf50+k4nLYT679bgcRNa7Fr9We9zuyPnnNm3+ZZJ1OiAk3Y9e2Xb0esDcaypfPh5fESXuvYEWNG+mNb9HfYuyl0yKOiX0nl/Sukhr71EY9HBHF4S8HY8QnIG1FXcZNU3r/K1gYxi2e+MW/IG97psSH+menJ2Bm7DnFRoYiNDEHylm+xf3sULmTsxqndGyZT4ubkTcfp0d8Mvf7TQSRuWoNj++Px6+l95wkhDuW5Fwm99+uEqMrzLhF9ye9WYzHB3KAmXub/zbk+NnGr/nqhlhdi2fjN3qM7Qplck0OgzyYGuoCi1qj6g9RX3CQ1ZVnM5a1QlkVqy7JIfeUt4Tp6v0d3SGPVHeMXoS3PE2YS6/GJx2o+XquxP4kArcMss7PBCjAds4Gb/TZvE/9uISn+L6C1sYsFkEKrHdqCx7lHWwb1tNCW57Sp09PEf/N5UhsjYlhkymc1OKn7Cp5gWp21PlB793oyCM9u01TxrCFeoIghbheHkfi8ZbuUuCbRmQDWN5Bqe9oQE5CCcF5IfG3vbzq29GzL8y2rwv8Hr1B1AJMQriMAAAAASUVORK5CYII=" alt=""><span>Image unavailable</span>';
  img.parentNode.replaceChild(place, img);
}
function categoryLabel(c){
  return {electronics:'Electronics', hostel:'Hostel essentials', audio:'Audio', photography:'Photography', food:'Food', books:'Books', fashion:'Fashion', beauty:'Beauty & personal care'}[c] || c;
}
function getListing(id){ return listings.find(i => i.id === id); }

function updateCartBadge(){
  const el = document.getElementById('cartBadge');
  if (!el) return;
  el.textContent = cart.reduce((sum, c) => sum + c.qty, 0);
}
function applyAccountToHeader(){
  const label = document.getElementById('accountLabel');
  if (label) label.textContent = account.name ? account.name : 'Profile';
}

// ---------- theme (dark mode) ----------
// Persistence key is 'duka-theme' (local:duka-theme in localStorage). Color
// changes are driven entirely by the CSS [data-theme="dark"] custom-property
// block plus a prefers-color-scheme mirror — no JS recoloring needed.
function themeIcon(mode){ return mode === 'dark' ? '☀' : '☾'; }

function currentThemeMode(){
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function updateThemeButton(){
  const icon = document.querySelector('.theme_icon');
  if (icon) icon.textContent = themeIcon(currentThemeMode());
}

function applyTheme(mode, withTransition){
  mode = (mode === 'dark' || mode === 'light') ? mode : 'light';
  const html = document.documentElement;
  if (withTransition){
    html.classList.add('theme-switching');
    setTimeout(() => html.classList.remove('theme-switching'), 350);
  }
  html.setAttribute('data-theme', mode);
  updateThemeButton();
}

async function initTheme(){
  let mode;
  try{
    const saved = await storageGet('duka-theme', false);
    mode = (saved === 'dark' || saved === 'light') ? saved : null;
  }catch(e){ mode = null; }
  if (!mode) mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(mode, false);
}

async function setTheme(mode){
  applyTheme(mode, true);
  try{ await storageSet('duka-theme', mode, false); }catch(e){}
}

function toggleTheme(){ setTheme(currentThemeMode() === 'dark' ? 'light' : 'dark'); }

function injectThemeButton(){
  const nav = document.querySelector('.header .information');
  if (!nav || document.getElementById('themeBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'themeBtn';
  btn.className = 'theme_btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Toggle dark mode');
  btn.title = 'Toggle dark mode';
  btn.innerHTML = '<span class="theme_icon" aria-hidden="true">' + themeIcon(currentThemeMode()) + '</span>';
  btn.addEventListener('click', toggleTheme);
  nav.insertBefore(btn, nav.firstChild);
}

window.setTheme = setTheme;
window.toggleTheme = toggleTheme;

// Call at the top of every page's own script. Loads listings/cart/account
// and updates the header pieces that appear on every page (cart badge,
// account name). Each page then does its own rendering after this resolves.
async function initShell(){
  try{
    await Promise.all([loadListings(), loadCart(), loadAccount()]);
  }catch(e){
    if (!listings.length) listings = DEFAULT_LISTINGS.slice();
  }
  updateCartBadge();
  applyAccountToHeader();
  injectThemeButton();
  await initTheme();
}

function bumpCartBadge(){
  const el = document.getElementById('cartBadge');
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 400);
}

async function addToCart(id){
  const item = listings.find(i => i.id === id);
  if (!item) return;
  const existing = cart.find(c => c.id === id);
  if (existing) existing.qty += 1;
  else cart.push({id: item.id, title: item.title, price: item.price, qty: 1});
  try{ await saveCart(); }catch(e){}
  updateCartBadge();
  bumpCartBadge();
  const btn = document.getElementById('btn_' + id);
  if (btn){
    btn.classList.remove('added');
    void btn.offsetWidth;
    btn.classList.add('added');
    btn.setAttribute('aria-label', 'Added to cart');
    setTimeout(() => btn.classList.remove('added'), 1200);
  }
}

async function finalizeRemove(id){
  cart = cart.filter(c => c.id !== id);
  try{ await saveCart(); }catch(e){}
  updateCartBadge();
  if (typeof renderCartPage === 'function') renderCartPage();
}

async function removeFromCart(id){
  const row = document.getElementById('cart_item_' + id);
  if (row){
    row.classList.add('cart-exit');
    row.addEventListener('animationend', () => { finalizeRemove(id); }, { once:true });
    return;
  }
  finalizeRemove(id);
}

function appendTypingIndicator(paneId){
  const pane = document.getElementById(paneId);
  if (!pane) return null;
  const dot = document.createElement('div');
  dot.className = 'typing seller';
  dot.innerHTML = '<i></i><i></i><i></i>';
  pane.appendChild(dot);
  pane.scrollTop = pane.scrollHeight;
  return dot;
}
function removeTypingIndicator(paneId, el){
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ---------- payment (Paystack Titan demo key — swap for your live/test public
// key before going live; Monnify follows the same load-SDK pattern) ----------
function payWithPaystackTitan(email, amountKobo){
  if (typeof PaystackPop === 'undefined') { alert('Payment demo is not available in this preview.'); return; }
  var handler = PaystackPop.setup({
    key: 'pk_test_xxxxxxxxxxxxxxxxxxxxx',
    email: email,
    amount: amountKobo,
    callback: function (response) { console.log('Payment complete, reference:', response.reference); },
    onClose: function () { console.log('Payment window closed'); }
  });
  handler.openIframe();
}
function payWithMonnify(email, amountNaira){ console.log('Wire up Monnify SDK here with your merchant key.'); }
