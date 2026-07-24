// Writes page template JSON files
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'theme', 'templates');

const templates = {
  'page.about.json': {
    sections: {
      hero: {
        type: "section-page-hero",
        settings: {
          eyebrow: "Our Story",
          title: "About Rue IV",
          overlay_opacity: 30,
          desktop_ratio: "21/9",
          mobile_ratio: "4/3",
          padding_top: 0,
          padding_bottom: 0
        }
      },
      story: {
        type: "section-rich-content",
        settings: {
          eyebrow: "Who We Are",
          heading: "The Rue IV Story",
          two_column: true,
          text_align: "left",
          padding_top: 60,
          padding_bottom: 36
        }
      },
      values: {
        type: "section-card-grid",
        blocks: {
          val_1: { type: "card", settings: { title: "Curated Quality" } },
          val_2: { type: "card", settings: { title: "Trade Expertise" } },
          val_3: { type: "card", settings: { title: "Personal Service" } }
        },
        block_order: ["val_1", "val_2", "val_3"],
        settings: {
          eyebrow: "What Drives Us",
          heading: "Our Values",
          columns: 3,
          gap: 24,
          image_ratio: "1/1",
          padding_top: 36,
          padding_bottom: 36
        }
      },
      team: {
        type: "section-gallery-grid",
        settings: {
          eyebrow: "The People",
          heading: "Meet the Team",
          columns: 3,
          gap: 24,
          padding_top: 36,
          padding_bottom: 36
        }
      },
      showroom: {
        type: "section-brand-showroom",
        settings: {
          heading: "Visit the Showroom",
          padding_top: 36,
          padding_bottom: 36
        }
      },
      newsletter: {
        type: "section-newsletter-signup",
        settings: {
          eyebrow: "Stay Connected",
          title: "The Vibe List",
          padding_top: 36,
          padding_bottom: 60
        }
      }
    },
    order: ["hero", "story", "values", "team", "showroom", "newsletter"]
  },

  'page.moodboards.json': {
    sections: {
      hero: {
        type: "section-page-hero",
        settings: {
          eyebrow: "Curated Inspiration",
          title: "Moodboards",
          overlay_opacity: 30,
          desktop_ratio: "21/9",
          mobile_ratio: "4/3",
          padding_top: 0,
          padding_bottom: 0
        }
      },
      intro: {
        type: "section-rich-content",
        settings: {
          heading: "Room Concepts, Curated by Rue IV",
          text_align: "center",
          padding_top: 52,
          padding_bottom: 36
        }
      },
      moodboards: {
        type: "section-vibe-moodboard-grid",
        settings: {
          eyebrow: "Browse",
          heading: "Moodboard Collection",
          columns: 3,
          gap: 24,
          image_ratio: "4/5",
          padding_top: 36,
          padding_bottom: 36
        }
      },
      gallery: {
        type: "section-gallery-grid",
        settings: {
          eyebrow: "In Detail",
          heading: "Inspiration Gallery",
          columns: 3,
          gap: 16,
          padding_top: 36,
          padding_bottom: 36
        }
      },
      cta: {
        type: "section-rich-content",
        settings: {
          heading: "Have a Vision?",
          text_align: "center",
          cta_label: "Submit a Request",
          padding_top: 36,
          padding_bottom: 60
        }
      }
    },
    order: ["hero", "intro", "moodboards", "gallery", "cta"]
  },

  'page.sustainability.json': {
    sections: {
      hero: {
        type: "section-page-hero",
        settings: {
          eyebrow: "Our Commitment",
          title: "Sustainability",
          overlay_opacity: 30,
          desktop_ratio: "21/9",
          mobile_ratio: "4/3",
          padding_top: 0,
          padding_bottom: 0
        }
      },
      mission: {
        type: "section-rich-content",
        settings: {
          eyebrow: "Our Mission",
          heading: "Design with Purpose",
          two_column: true,
          text_align: "left",
          padding_top: 60,
          padding_bottom: 36
        }
      },
      pillars: {
        type: "section-card-grid",
        blocks: {
          p_1: { type: "card", settings: { title: "Responsible Sourcing" } },
          p_2: { type: "card", settings: { title: "Artisan Partnerships" } },
          p_3: { type: "card", settings: { title: "Minimal Waste" } }
        },
        block_order: ["p_1", "p_2", "p_3"],
        settings: {
          eyebrow: "How We Act",
          heading: "Our Pillars",
          columns: 3,
          gap: 24,
          image_ratio: "1/1",
          padding_top: 36,
          padding_bottom: 36
        }
      },
      partners: {
        type: "section-gallery-grid",
        settings: {
          eyebrow: "Partners",
          heading: "Makers We Trust",
          columns: 4,
          gap: 16,
          padding_top: 36,
          padding_bottom: 36
        }
      },
      closing: {
        type: "section-rich-content",
        settings: {
          heading: "Our Promise",
          text_align: "center",
          cta_label: "Learn More",
          padding_top: 36,
          padding_bottom: 60
        }
      }
    },
    order: ["hero", "mission", "pillars", "partners", "closing"]
  },

  'page.designer-spotlight.json': {
    sections: {
      hero: {
        type: "section-page-hero",
        settings: {
          eyebrow: "Featured",
          title: "Designer Spotlight",
          overlay_opacity: 30,
          desktop_ratio: "21/9",
          mobile_ratio: "4/3",
          padding_top: 0,
          padding_bottom: 0
        }
      },
      bio: {
        type: "section-rich-content",
        settings: {
          heading: "Designer Name",
          two_column: false,
          text_align: "center",
          padding_top: 60,
          padding_bottom: 36
        }
      },
      work: {
        type: "section-gallery-grid",
        settings: {
          eyebrow: "Portfolio",
          heading: "Selected Work",
          columns: 3,
          gap: 16,
          padding_top: 36,
          padding_bottom: 36
        }
      },
      products: {
        type: "featured-collection",
        settings: {
          heading: "Shop Their Picks",
          heading_size: "h2",
          columns: 4,
          products_to_show: 8,
          padding_top: 36,
          padding_bottom: 36
        }
      },
      more_designers: {
        type: "section-card-grid",
        settings: {
          eyebrow: "Explore More",
          heading: "Other Designers",
          columns: 3,
          gap: 24,
          image_ratio: "1/1",
          padding_top: 36,
          padding_bottom: 36
        }
      },
      newsletter: {
        type: "section-newsletter-signup",
        settings: {
          eyebrow: "Stay Inspired",
          title: "The Vibe List",
          padding_top: 36,
          padding_bottom: 60
        }
      }
    },
    order: ["hero", "bio", "work", "products", "more_designers", "newsletter"]
  }
};

for (const [filename, data] of Object.entries(templates)) {
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ✓ ${filename}`);
}
console.log('\nDone — all templates written.');
