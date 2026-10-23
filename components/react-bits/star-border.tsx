/**
 * React Bits «StarBorder», in CSS only (reactbits.dev, MIT + Commons Clause): a comet of light
 * circles the border of its positioned parent, with a soft glow behind it. Put it inside a card
 * with rounded corners; reduced motion hides it.
 */
export function StarBorder() {
  return <>
    <span aria-hidden="true" className="rb-star-glow"><span className="rb-star-border" /></span>
    <span aria-hidden="true" className="rb-star-border" />
  </>;
}
