import React from "react";
import { ArrowRight, Leaf, Coins, Package, Check } from "./Icons.jsx";
export default function DashboardHome({
  requests,
  userId,
  profile,
  setScreen,
  onNew,
}) {
  const mine = requests.filter((r) => r.user_id === userId);
  const completed = mine.filter((r) => r.status === "VERIFIED");
  const kg = completed.reduce(
    (sum, r) => sum + Number(r.actual_weight_kg || 0),
    0,
  );
  const active = mine.filter(
    (r) => !["VERIFIED", "CANCELLED"].includes(r.status),
  );
  const target =
    kg < 10 ? 10 : kg < 25 ? 25 : kg < 50 ? 50 : Math.ceil((kg + 1) / 50) * 50;
  const name = profile?.full_name?.split(" ")[0] || "neighbour";
  return (
    <div className="dashboardPage">
      <div className="dashGreeting">
        <div>
          <span className="eyebrow">
            A LITTLE EVERY DAY. A BETTER TOMORROW.
          </span>
          <h1>
            Hello, {name}
            <span className="greetingDot">.</span>
          </h1>
          <p>Good things grow from small habits. Let’s keep yours going.</p>
        </div>
        <span className="dashDate">
          {new Date().toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      <section className="dashHero">
        <img
          src="/art/dashboard-community.webp"
          alt="A neighbour carrying a reusable bag of sorted plastic bottles"
        />
        <div>
          <span className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</span>
          <h2>
            Your next good
            <br />
            move starts here.
          </h2>
          <p>
            That bag of bottles? A cleaner neighbourhood.
            <br />
            And a little something back for you.
          </p>
          <button className="primary" onClick={onNew}>
            Schedule a pickup <ArrowRight size={18} />
          </button>
        </div>
      </section>
      <div className="dashMetrics">
        <div>
          <span>
            <Leaf size={19} /> Plastic recycled
          </span>
          <strong>
            {kg.toFixed(1)}
            <small> kg</small>
          </strong>
          <p>Weighed & verified</p>
        </div>
        <button onClick={() => setScreen("wallet")}>
          <span>
            <Coins size={19} /> Available points
          </span>
          <strong>
            {(profile?.points || 0).toLocaleString()}
            <small> pts</small>
          </strong>
          <p>
            Your next reward is getting closer <ArrowRight size={13} />
          </p>
        </button>
        <button onClick={() => setScreen("pickups")}>
          <span>
            <Package size={19} /> Completed pickups
          </span>
          <strong>{completed.length.toString().padStart(2, "0")}</strong>
          <p>
            {active.length
              ? `${active.length} collection${active.length > 1 ? "s" : ""} in progress`
              : "Ready whenever you are"}{" "}
            <ArrowRight size={13} />
          </p>
        </button>
      </div>
      <div className="dashColumns">
        <section className="dashPanel">
          <div className="dashSectionTitle">
            <div>
              <span className="eyebrow">ONE BAG AT A TIME</span>
              <h2>Your recycling progress</h2>
            </div>
            <span className="dashBadge">
              {kg >= 50
                ? "Platinum"
                : kg >= 25
                  ? "Gold"
                  : kg >= 10
                    ? "Silver"
                    : "Bronze"}
            </span>
          </div>
          <div className="impactNumber">
            {kg.toFixed(1)}
            <span> / {target} kg</span>
          </div>
          <div
            className="dashProgress"
            role="progressbar"
            aria-label="Recycling milestone"
            aria-valuenow={kg}
            aria-valuemin={0}
            aria-valuemax={target}
          >
            <span style={{ width: `${Math.min(100, (kg / target) * 100)}%` }} />
          </div>
          <p>
            Just {(target - kg).toFixed(1)} kg to your next milestone. Every
            bottle counts.
          </p>
          <div className="impactFoot">
            <Check size={17} /> Your impact stays with you, even when you spend
            points.
          </div>
        </section>
      </div>
      <section className="dashPanel">
        <div className="dashSectionTitle">
          <div>
            <span className="eyebrow">YOUR COLLECTIONS</span>
            <h2>
              {active.length
                ? "Good things are on the way."
                : "Every pickup has a story."}
            </h2>
          </div>
          <button className="textButton" onClick={() => setScreen("pickups")}>
            View all <ArrowRight size={16} />
          </button>
        </div>
        {mine.length ? (
          mine.slice(0, 3).map((r) => (
            <button
              key={r.id}
              className="dashPickupRow"
              onClick={() => setScreen("pickups")}
            >
              <span className="pickupSymbol">
                <Package size={22} />
              </span>
              <span>
                <strong>{r.material_type}</strong>
                <small>
                  {new Date(r.created_at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {r.pickup_location}
                </small>
              </span>
              <span className="dashBadge">
                {r.status.replaceAll("_", " ").toLowerCase()}
              </span>
              <ArrowRight size={17} />
            </button>
          ))
        ) : (
          <div className="dashEmpty">
            <Package size={32} />
            <h3>Your first collection starts here.</h3>
            <p>
              We’ll keep your pickup updates and verified weights in one place.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
