## Visual Rules

Apply these before writing the HTML. They decide whether the diagram reads at a glance.

- **Delete first.** Each node is one distinct idea. Merge nodes that always appear together. Keep an edge only when it carries information the layout does not already show.
- **Density.** Aim for 3–7 nodes. Keep the core path and move supporting detail into `details`. Never exceed the node-count constraint.
- **One reading direction.** Use top-to-bottom by default. Use left-to-right only when the flow has at most four steps across. Use one direction per diagram.
- **Clean geometry.** No two nodes may overlap, and no edge may pass through a node. Route an edge that skips a rank around the nodes in between. Keep the gaps between nodes in a rank equal. Every coordinate must lie inside the viewBox.
- **Focal nodes.** Give the accent style to at most two nodes, the ideas the learner must remember. Never more.
- **Palette (dark).** Background `#2d3142`, panel `#393e53`. Node fill `#f5f5f5` with text `#111111`. Focal node fill `#f08a59` with text `#111111`. Edges and arrowheads `#bfc0c0`. Edge labels: text `#f5f5f5` on a `#2d3142` pill. Use no other colours.
