/** Same physical surface used by the baked paper, runtime ink and native links. */
export function paperLift(u:number,v:number,coefficients:readonly number[]) {
  return (coefficients[0]??0)*u*u*(1-v)**2+(coefficients[1]??0)*v**7*(.6+.4*u);
}

/** The near edge is held; the loose far edge lags the pad during a lift. */
export function paperFlex(u:number,v:number,amount:number) {
  return amount*(1-v)**2*(.55+.45*u);
}
