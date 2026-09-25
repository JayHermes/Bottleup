import React from "react";

// Same local SVG library and mask rendering used by KingFTP.
export function Icon({ name, size = 24, className = "", style, ...props }) {
  const { strokeWidth, ...attributes } = props;
  return (
    <span
      {...attributes}
      aria-hidden="true"
      className={`appIcon ${className}`}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        flexShrink: 0,
        backgroundColor: "currentColor",
        verticalAlign: "middle",
        mask: `url(/icons/${name}.svg) center / contain no-repeat`,
        WebkitMask: `url(/icons/${name}.svg) center / contain no-repeat`,
        ...style,
      }}
    />
  );
}

const icon = (name) => (props) => <Icon name={name} {...props} />;
export const ArrowRight = icon("arrow-forward");
export const Bell = icon("notifications-outline");
export const Camera = icon("camera-outline");
export const Check = icon("checkmark");
export const ChevronRight = icon("chevron-forward");
export const Coins = icon("cash-outline");
export const Eye = icon("eye-outline");
export const EyeOff = icon("eye-off-outline");
export const Gift = icon("gift-outline");
export const Home = icon("home-outline");
export const Leaf = icon("leaf-outline");
export const MapPin = icon("location-outline");
export const Package = icon("cube-outline");
export const Pencil = icon("pencil-outline");
export const Recycle = icon("sync-outline");
export const ShieldCheck = icon("shield-checkmark-outline");
export const Truck = icon("bicycle-outline");
export const UserRound = icon("person-outline");
export const Users = icon("people-outline");
export const WalletCards = icon("wallet-outline");
export const Weight = icon("scale-outline");
export const X = icon("close");
