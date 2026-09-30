Website/UI things NOT to use
(
**Visual style**

* Harsh gradients
* Purple blur backgrounds
* Rainbow borders
* Drop shadows
* Radial orbs
* Dot grids
* Neon colors
* Basic pastel color palettes
* Purple + black as the default aesthetic


**Typography**

*  Inter
*  Geist
*  Space Grotesk

**Icons**

*  Lucide icons

**Copywriting**

* No “Built for…” style copy
* No Generic startup/AI fluff
* No Checkmark-bullet sections
* No Overly generic marketing language
)


**Product/marketing structures**

*  3-tier pricing sections
* No Fake testimonials
*  Generic feature-card grids
* No Pretending something is a real product/demo when it isn't

**Legal / trust**

*  Add Terms of Service
*  Add Privacy Policy

### ⚡ Performance rules you specifically wanted

 Performance Checklist:

**DO:**

*  Cache API responses
*  Use a load balancer where appropriate
*  Index the database
*  Compress images
*  Use loading skeletons
*  Cache expensive queries
*  Debounce input handlers
*  Split code into chunks
*  Add a CDN
*  Use server-side caching
*  Paginate large lists
*  Run Lighthouse audits
*  Compress API payloads
*  Minify JS/CSS
*  Lazy-load resources
*  Defer scripts
*  Use database connection pooling



**DON'T:**

*  N+1 database queries
*  Unnecessary React/component re-renders
*  Unused dependencies


**UI patterns that can be used**

*  Bento grids
*  Terminal-window UI
*  3 features at the top, glow underneath
*  Liquid buttons
*  Animated arrows
*  Hover animations when needed
*  real product demos
*  Emoji-heavy UI

### 📡 Content Streaming (viewport lifecycle)

* Content streams at the element level, not the section level: individual UI elements appear the moment they enter the viewport — including elements already in view on page load — and clip away once scrolled past above.
* Never let streaming move the layout: hide with `clip-path` + `visibility` only (elements keep their box), so the scrollbar and document height never jump.
* Keep the base state fully visible and stream only as a progressive enhancement; under prefers-reduced-motion, reveal everything immediately with no animation.
* Animate only on reveal (the intentional "print-wipe" — top-to-bottom clip with opacity tracking); destruction is instant.
* Group elements per section and stagger them with a small per-item delay (`--d`), so a block enters as a deliberate sequence rather than a flash.
* Live widgets (demos, tickers) must re-resolve nodes on every paint — no stale node references — and keep ticking through clip/unclip cycles.
* Implement via the **Content Streaming** skill: C:\Users\ayool\.agents\skills\content-streaming\SKILL.md

Don't make websites look like they were generated from the same AI-startup template.
The interface should have an actual product identity and feel intentional.

