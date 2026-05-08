import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TCS Certificados — Painel",
  description: "Emissão, gestão e validação de certificados com segurança.",
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`.trim();

const hydrationAttributeSanitizerScript = `
(function(){
  var attributes = ['bis_skin_checked'];

  function clean(root) {
    try {
      if (!root) return;

      if (root.nodeType === 1) {
        for (var i = 0; i < attributes.length; i += 1) {
          if (root.hasAttribute && root.hasAttribute(attributes[i])) {
            root.removeAttribute(attributes[i]);
          }
        }
      }

      if (!root.querySelectorAll) return;

      for (var j = 0; j < attributes.length; j += 1) {
        var nodes = root.querySelectorAll('[' + attributes[j] + ']');
        for (var k = 0; k < nodes.length; k += 1) {
          nodes[k].removeAttribute(attributes[j]);
        }
      }
    } catch (e) {}
  }

  clean(document);

  try {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];
        if (mutation.type === 'attributes') {
          clean(mutation.target);
          continue;
        }

        for (var j = 0; j < mutation.addedNodes.length; j += 1) {
          clean(mutation.addedNodes[j]);
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: attributes,
      childList: true,
      subtree: true
    });

    var stop = function() {
      clean(document);
      observer.disconnect();
    };

    window.addEventListener('load', function() {
      window.setTimeout(stop, 1000);
    }, { once: true });
    window.setTimeout(stop, 5000);
  } catch (e) {}
})();
`.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      {/* Anti-flash theme script — runs before paint */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Script
          id="hydration-attribute-sanitizer"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: hydrationAttributeSanitizerScript }}
        />
        <Script
          id="theme-before-paint"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
