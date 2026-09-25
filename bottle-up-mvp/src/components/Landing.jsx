import React, { useEffect, useRef, useState } from "react";
import Brand from "./Brand.jsx";
import { Icon } from "./Icons.jsx";
import "./landing.css";

const faqs = [
  [
    "What can I give for recycling?",
    "You can request a pickup for PET bottles, plastic containers, HDPE plastic, or mixed plastic. Empty your containers, give them a quick rinse, and keep them together in a bag for collection.",
  ],
  [
    "How does a pickup work?",
    "Create an account and tell us the type of plastic, its estimated weight, and your pickup location. You can add a photo and GPS location. A collector accepts your request, and you can follow its status in the app.",
  ],
  [
    "When do I receive my points?",
    "After collection, the recorded weight is reviewed and verified. You earn 100 points for every verified kilogram. Your estimate helps arrange the pickup; your final points are based on verified weight.",
  ],
  [
    "What can I redeem my points for?",
    "Pilot rewards include airtime, shopping vouchers, and pickup rewards. Availability depends on active partners, and the BottleUp team handles fulfilment. Points are a reward balance and cannot be withdrawn as cash.",
  ],
  [
    "Can I become a collector?",
    "Yes. Choose the collector application option when creating your account. The BottleUp team reviews applications before granting collector access.",
  ],
];

export default function Landing({ onAuth, onLegal }) {
  const pageRef = useRef(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = [
      ...pageRef.current.querySelectorAll(
        ".bu-section-heading, .bu-step, .bu-rewards-art, .bu-rewards-copy, .bu-community, .bu-faq > div, .bu-final-cta, .bu-footer-top",
      ),
    ];
    if (media.matches || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("bu-in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    elements.forEach((element) => {
      // Keep content already on screen visible, including direct section links.
      if (element.getBoundingClientRect().top < window.innerHeight) return;
      element.classList.add("bu-reveal");
      observer.observe(element);
    });
    const revealAll = () => {
      if (media.matches) {
        observer.disconnect();
        elements.forEach((element) => element.classList.add("bu-in-view"));
      }
    };
    media.addEventListener("change", revealAll);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", revealAll);
      elements.forEach((element) =>
        element.classList.remove("bu-reveal", "bu-in-view"),
      );
    };
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kilograms, setKilograms] = useState(5);
  const enter = (mode) => {
    setMenuOpen(false);
    onAuth(mode);
  };
  return (
    <div className="bu-landing" id="top" ref={pageRef}>
      <a className="bu-skip" href="#main-content">
        Skip to content
      </a>
      <header className="bu-header">
        <div className="bu-nav bu-container">
          <Brand />
          <nav className="bu-desktop-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#rewards">The good stuff</a>
            <a href="#questions">Got questions?</a>
          </nav>
          <div className="bu-nav-actions">
            <button className="bu-signin" onClick={() => enter("signin")}>
              Sign in <Icon name="arrow-forward" size={17} />
            </button>
            <button
              className="bu-menu-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            id="mobile-navigation"
            className="bu-mobile-nav"
            aria-label="Mobile navigation"
          >
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              How it works
            </a>
            <a href="#rewards" onClick={() => setMenuOpen(false)}>
              The good stuff
            </a>
            <a href="#questions" onClick={() => setMenuOpen(false)}>
              Got questions?
            </a>
            <button onClick={() => enter("signup")}>
              Start recycling <Icon name="arrow-forward" size={18} />
            </button>
          </nav>
        )}
      </header>
      <main id="main-content">
        <section className="bu-hero bu-container" aria-labelledby="hero-title">
          <div className="bu-hero-copy">
            <span className="bu-eyebrow">
              <span className="bu-tiny-sun" aria-hidden="true">
                ✳
              </span>{" "}
              A LITTLE PLASTIC. A LOT OF POSSIBILITY.
            </span>
            <h1 id="hero-title">
              Good things
              <br />
              come{" "}
              <span>
                around
                <svg viewBox="0 0 420 22" aria-hidden="true">
                  <path d="M4 15C100 1 260 1 413 9M24 20C170 9 280 11 383 15" />
                </svg>
              </span>
              .
            </h1>
            <p>
              That bottle’s story isn’t over.
              <br className="bu-desktop-break" /> Give your plastic a new
              beginning — and get rewarded for it.
            </p>
            <div className="bu-hero-actions">
              <button className="bu-button" onClick={() => enter("signup")}>
                Request a pickup <Icon name="arrow-forward" size={20} />
              </button>
              <a className="bu-text-link" href="#how-it-works">
                Show me how <Icon name="arrow-down" size={17} />
              </a>
            </div>
            <div className="bu-hero-note">
              <Icon name="shield-checkmark-outline" size={18} />
              <span>
                Real collections. Verified weight. Points you can track.
              </span>
            </div>
          </div>
          <div className="bu-hero-art">
            <img
              src="/illustrations/pickup-hero.webp"
              width="1536"
              height="1024"
              alt="A resident hands a bag of plastic bottles to a BottleUp collector outside her home."
              fetchpriority="high"
            />
            <div className="bu-round-stamp" aria-hidden="true">
              <Icon name="sparkles" size={25} />
              <span>
                SMALL ACTS.
                <br />
                GOOD THINGS.
              </span>
            </div>
            <span className="bu-art-caption">
              <span aria-hidden="true">↳</span> A fresh start, right at your
              doorstep.
            </span>
          </div>
        </section>

        <div className="bu-materials" aria-label="Accepted materials">
          <div className="bu-container">
            <span className="bu-materials-label">GOOD TO GO AGAIN</span>
            <span>
              PET bottles <span aria-hidden="true">✳</span>
            </span>
            <span>
              Plastic containers <span aria-hidden="true">✳</span>
            </span>
            <span>
              HDPE plastic <span aria-hidden="true">✳</span>
            </span>
            <span>Mixed plastic</span>
          </div>
        </div>

        <section
          className="bu-how bu-container bu-section"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="bu-section-heading">
            <div>
              <span className="bu-eyebrow">LESS WASTE. MORE POSSIBILITY.</span>
              <h2 id="how-title">
                Your everyday plastic.
                <br />
                Its next little adventure.
              </h2>
            </div>
            <p>
              No guessing where it goes.
              <br />
              Follow your collection from your
              <br className="bu-desktop-break" /> doorstep to verified rewards.
            </p>
          </div>
          <div className="bu-steps">
            <article className="bu-step bu-step-peach">
              <div className="bu-step-top">
                <span>01 / BAG IT</span>
                <Icon name="arrow-down" size={22} />
              </div>
              <div
                className="bu-step-drawing bu-bag-drawing"
                aria-hidden="true"
              >
                <Icon name="bag-handle-outline" size={88} />
                <span className="bu-drawing-spark">✳</span>
                <span className="bu-drawing-dot" />
              </div>
              <h3>
                A little sorting.
                <br />A good start.
              </h3>
              <p>
                Empty and rinse your plastic. Bag it up, then tell us what you
                have and where to collect it.
              </p>
            </article>
            <article className="bu-step bu-step-blue">
              <div className="bu-step-top">
                <span>02 / PASS IT ON</span>
                <Icon name="arrow-forward" size={22} />
              </div>
              <div
                className="bu-step-drawing bu-route-drawing"
                aria-hidden="true"
              >
                <Icon name="location" size={42} />
                <span className="bu-dotted-route" />
                <Icon name="bicycle-outline" size={77} />
              </div>
              <h3>
                Your doorstep.
                <br />
                Our next stop.
              </h3>
              <p>
                A collector accepts your request. Follow along in the app as
                your plastic heads for its next chapter.
              </p>
            </article>
            <article className="bu-step bu-step-yellow">
              <div className="bu-step-top">
                <span>03 / GET THE GOOD</span>
                <Icon name="checkmark" size={22} />
              </div>
              <div
                className="bu-step-drawing bu-reward-drawing"
                aria-hidden="true"
              >
                <span>
                  <Icon name="sparkles" size={54} />
                </span>
                <Icon name="star-outline" size={27} />
              </div>
              <h3>
                Verified plastic.
                <br />
                Well-earned points.
              </h3>
              <p>
                We verify the collected weight. You get 100 points per kilogram,
                ready to build towards rewards.
              </p>
            </article>
          </div>
        </section>

        <section
          className="bu-rewards-wrap"
          id="rewards"
          aria-labelledby="rewards-title"
        >
          <div className="bu-rewards bu-container">
            <div className="bu-rewards-art">
              <img
                src="/illustrations/bottle-rewards.webp"
                width="1254"
                height="1254"
                loading="lazy"
                alt="Three colourful empty plastic bottles and an orange reward token."
              />
              <span className="bu-handwritten">
                A second life looks
                <br />
                good on you. <span aria-hidden="true">↗</span>
              </span>
            </div>
            <div className="bu-rewards-copy">
              <span className="bu-eyebrow">A THANK-YOU THAT ADDS UP</span>
              <h2 id="rewards-title">
                Good for your street.
                <br />
                <span>Good for you, too.</span>
              </h2>
              <p>
                A cleaner corner of the world is a pretty good reward. A little
                something back? Even better.
              </p>
              <div className="bu-calculator">
                <div className="bu-calculator-top">
                  <label htmlFor="plastic-weight">
                    Imagine recycling <strong>{kilograms} kg</strong>
                  </label>
                  <span>100 points / kg</span>
                </div>
                <input
                  id="plastic-weight"
                  type="range"
                  min="1"
                  max="20"
                  value={kilograms}
                  onChange={(e) => setKilograms(Number(e.target.value))}
                  aria-valuetext={`${kilograms} kilograms, ${kilograms * 100} points after verification`}
                />
                <div className="bu-calculator-result">
                  <output htmlFor="plastic-weight">
                    {(kilograms * 100).toLocaleString()} <span>points</span>
                  </output>
                  <span>
                    After collection
                    <br />
                    and verification <Icon name="checkmark-circle" size={19} />
                  </span>
                </div>
              </div>
              <div className="bu-reward-types">
                <span>
                  <Icon name="phone-portrait-outline" size={20} /> Airtime
                </span>
                <span>
                  <Icon name="gift-outline" size={20} /> Shopping vouchers
                </span>
                <span>
                  <Icon name="bag-handle-outline" size={20} /> Pickup rewards
                </span>
              </div>
              <p className="bu-small-print">
                Rewards are part of our pilot and depend on partner
                availability. Points are for rewards, not cash withdrawals.
              </p>
            </div>
          </div>
        </section>

        <section
          className="bu-community bu-container bu-section"
          aria-labelledby="community-title"
        >
          <span className="bu-eyebrow">IT STARTS WITH WHAT’S IN YOUR HAND</span>
          <h2 id="community-title">
            One bottle won’t change everything.
            <br />
            <span>But it’s a pretty good place to start.</span>
          </h2>
          <div className="bu-community-bottom">
            <p>
              A bag in your kitchen. A collector on your street. A small habit
              that keeps useful plastic in the loop. That’s BottleUp.
            </p>
            <button className="bu-text-link" onClick={() => enter("signup")}>
              Be part of the loop <Icon name="arrow-forward" size={20} />
            </button>
          </div>
        </section>

        <section
          className="bu-faq-wrap"
          id="questions"
          aria-labelledby="faq-title"
        >
          <div className="bu-faq bu-container">
            <div>
              <span className="bu-eyebrow">LET’S CLEAR A FEW THINGS UP</span>
              <h2 id="faq-title">
                Good questions.
                <br />
                Straight answers.
              </h2>
              <span className="bu-faq-decoration" aria-hidden="true">
                <Icon name="chatbubbles-outline" size={82} />
              </span>
            </div>
            <div className="bu-faq-list">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span className="bu-faq-plus" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bu-final-cta bu-container">
          <div>
            <span className="bu-eyebrow">READY WHEN YOU ARE</span>
            <h2>
              Your next good thing?
              <br />
              It’s in the bag.
            </h2>
          </div>
          <div>
            <button
              className="bu-button bu-button-ink"
              onClick={() => enter("signup")}
            >
              Let’s get recycling <Icon name="arrow-forward" size={20} />
            </button>
            <p>A few bottles. A fresh beginning.</p>
          </div>
          <span className="bu-cta-spark" aria-hidden="true">
            ✳
          </span>
        </section>
      </main>
      <footer className="bu-footer bu-container">
        <div className="bu-footer-top">
          <Brand footer />
          <p>
            Small acts. Cleaner neighbourhoods.
            <br />
            Good things, coming around.
          </p>
          <a className="bu-back-top" href="#top">
            Back to top <Icon name="arrow-up" size={18} />
          </a>
        </div>
        <div className="bu-footer-bottom">
          <span>© {new Date().getFullYear()} BottleUp</span>
          <div>
            <button onClick={() => onLegal("privacy")}>Privacy policy</button>
            <button onClick={() => onLegal("terms")}>Terms of use</button>
          </div>
          <span>Made for a little more good.</span>
        </div>
      </footer>
    </div>
  );
}
