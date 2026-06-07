"use client";
import React, { useState } from "react";
import { Table, Sparkles } from "lucide-react";

export default function PayoffMatrix({ games, onDiscuss }) {
  const [gi, setGi] = useState(0);
  const [sel, setSel] = useState(null);
  const g = games[gi];
  const isNash = (r, c) => g.nash.includes(`${r}-${c}`);

  return (
    <section className="ir-card">
      <h3><Table size={15} /> Interactive Payoff Matrix</h3>
      {games.length > 1 && (
        <div className="ir-gamepick">
          {games.map((gm, i) => (
            <button key={i} className={i === gi ? "on" : ""}
              onClick={() => { setGi(i); setSel(null); }}>{gm.name}</button>
          ))}
        </div>
      )}
      <div className="ir-matrixwrap">
        <div className="ir-axiscol">{g.cols} &rarr;</div>
        <table className="ir-matrix">
          <thead>
            <tr><th></th>{g.options.map((o, c) => <th key={c}>{o}</th>)}</tr>
          </thead>
          <tbody>
            {g.options.map((ro, r) => (
              <tr key={r}>
                <th className="ir-rowhead">{r === 0 && <span className="ir-axisrow">{g.rows} &darr;</span>}{ro}</th>
                {g.options.map((co, c) => {
                  const [a, b] = g.payoffs[r][c];
                  const on = sel === `${r}-${c}`;
                  return (
                    <td key={c} className={`ir-cell ${on ? "sel" : ""} ${isNash(r, c) ? "nash" : ""}`}
                      onClick={() => setSel(`${r}-${c}`)}>
                      <span className="ir-pay">{a}, {b}</span>
                      {isNash(r, c) && <span className="ir-nashtag">Nash</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel
        ? (() => {
            const [r, c] = sel.split("-").map(Number);
            const [a, b] = g.payoffs[r][c];
            return <p className="ir-cellnote">You <strong>{g.options[r].toLowerCase()}</strong>, they <strong>{g.options[c].toLowerCase()}</strong> &rarr; payoff <strong>({a}, {b})</strong>{isNash(r, c) ? " \u2014 this is a Nash equilibrium: neither side gains by switching alone." : "."}</p>;
          })()
        : <p className="ir-cellhint">Tap any cell to see the outcome. Gold cells are Nash equilibria.</p>}
      <p className="ir-gamenote">{g.note}</p>
      <button className="ir-ghostbtn" onClick={() => onDiscuss(g.name)}>
        <Sparkles size={14} /> Ask the tutor about {g.name}
      </button>
    </section>
  );
}
