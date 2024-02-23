import * as d3 from "d3";

import "./main.css";

const POINTS_COUNT = 5000;
const LERP_SPEED = 0.5;
const WEIGHT_MULTIPLIER = 4;

const $canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const $buffer = document.createElement("canvas");

const context = $canvas.getContext("2d")!;
const bufferContext = $buffer.getContext("2d", { willReadFrequently: true })!;

context.imageSmoothingEnabled = false;

const randomInt = (max: number) => Math.floor(Math.random() * max);

const getLuminosityFromBuffer = (
  buffer: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
) => {
  const index = (y * width + x) * 4;
  const [r, g, b] = buffer.slice(index, index + 3);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

type Vector = {
  x: number;
  y: number;
};

const calculateDelaunay = (points: Vector[]) => {
  const pointsArray = [];

  for (let vector of points) {
    pointsArray.push(vector.x, vector.y);
  }
  return new d3.Delaunay<number>(pointsArray);
};

const image = new Image();
image.addEventListener("load", () => {
  let delaunay: d3.Delaunay<number> | null = null;
  let voronoi: d3.Voronoi<number> | null = null;
  let points: Vector[] = [];

  $canvas.width = image.width;
  $canvas.height = image.height;
  $buffer.width = $canvas.width;
  $buffer.height = $canvas.height;

  context.fillStyle = "red";

  bufferContext.drawImage(image, 0, 0);

  const imageDataBuffer = bufferContext.getImageData(
    0,
    0,
    $canvas.width,
    $canvas.height,
  ).data;

  for (let i = 0; i < POINTS_COUNT; i++) {
    const x = randomInt($canvas.width);
    const y = randomInt($canvas.height);
    const luminosity = getLuminosityFromBuffer(
      imageDataBuffer,
      x,
      y,
      $canvas.width,
    );

    if (randomInt(100) > luminosity) {
      points.push({ x, y });
    } else {
      i--;
    }
  }

  delaunay = calculateDelaunay(points);
  voronoi = delaunay.voronoi([0, 0, $canvas.width, $canvas.height])!;

  const frame = () => {
    const feedback = recalculate(imageDataBuffer, delaunay!, voronoi!, points);

    delaunay = feedback.delaunay;
    voronoi = feedback.voronoi;
    points = feedback.points;

    context.clearRect(0, 0, $canvas.width, $canvas.height);

    for (let [idx, vector] of points.entries()) {
      context.beginPath();
      context.arc(
        vector.x,
        vector.y,
        feedback.weights[idx] * WEIGHT_MULTIPLIER,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
});

const lerpPoint = (a: Vector, b: Vector, t: number): Vector => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const lerpPoints = (a: Vector[], b: Vector[], t: number) =>
  a.map((v, i) => lerpPoint(v, b[i], t));

const recalculate = (
  imageDataBuffer: Uint8ClampedArray,
  delaunay: d3.Delaunay<number>,
  voronoi: d3.Voronoi<number>,
  points: Vector[],
) => {
  const polygons = voronoi.cellPolygons();
  const cells = Array.from(polygons);
  const centroids: Vector[] = new Array(POINTS_COUNT);
  const weights: number[] = new Array(cells.length).fill(0);
  const counts: number[] = new Array(cells.length).fill(0);
  const avgWeights: number[] = new Array(cells.length).fill(0);

  for (let i = 0; i < centroids.length; i++) {
    centroids[i] = { x: 0, y: 0 };
  }

  let delaunayIndex = 0;
  let maxWeight = 0;

  for (let y = 0; y < $canvas.height; y++) {
    for (let x = 0; x < $canvas.width; x++) {
      const luminosity = getLuminosityFromBuffer(
        imageDataBuffer,
        x,
        y,
        $canvas.width,
      );

      const weight = 1 - luminosity / 255;

      delaunayIndex = delaunay.find(x, y, delaunayIndex);
      centroids[delaunayIndex].x += x * weight;
      centroids[delaunayIndex].y += y * weight;
      weights[delaunayIndex] += weight;
      counts[delaunayIndex]++;
    }
  }

  for (let i = 0; i < centroids.length; i++) {
    if (weights[i] > 0) {
      const { x, y } = centroids[i];
      centroids[i] = { x: x / weights[i], y: y / weights[i] };
      avgWeights[i] = weights[i] / (counts[i] || 1);
      if (avgWeights[i] > maxWeight) {
        maxWeight = avgWeights[i];
      }
    } else {
      centroids[i] = { ...points[i] };
    }
  }

  const lerpedPoints = lerpPoints(points, centroids, LERP_SPEED);

  return {
    delaunay: calculateDelaunay(points),
    voronoi: delaunay.voronoi([0, 0, $canvas.width, $canvas.height]),
    points: lerpedPoints,
    weights: avgWeights,
  };
};

image.src = "/example.jpeg";
