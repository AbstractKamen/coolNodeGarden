# Cool Node Garden v0.0.3
### Description 

A while ago I saw a cool background effect for a *api-secret-sharing-service* I use at work. 
The effect is bassically described as a bunch of nodes which can be linked by a thin line if they are at a certain distance from each other.

### Changelog

- [x] Normal Nodes - nodes which do not have any special properties
- [x] Line Nodes   - nodes which try to connect to other nodes with a thin line based on their distance
- [x] Group Nodes  - larger nodes with a randomly assigned colour which can extend to other types of nodes; group nodes are also line nodes with a larger line distance
- [x] node aging which affects node velocity
- [x] opt* nodes stop after death (lifespan reaches 0)
- [x] opt* nodes drift offscreen after death
- [x] opt* nodes collide with canvas boundary
- [x] opt* nodes pass through canvas boundary and come through the opposite side
- [x] opt* draw only N closest distance lines
- [x] debug grids for Line and Group nodes
- [x] relative text and debug buttons

### Ideas
- [ ] Node collision
- [ ] Node attraction
- [ ] Node repelling
- [ ] Node dragging
- [ ] Create artificial boundary inside canvas, so nodes can collide with it or pass through
- [ ] Voronoi Nodes which can be arranged by some input (img, text, pixels) and given other node properties (lines and colour). Should be immovable so the voronoi can be seen :)
- [ ] Ui with more buttons which are relative to width and

todo add screenshots
