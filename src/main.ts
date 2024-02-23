import * as d3 from "d3";

import "./main.css";

const POINTS_COUNT = 5000;
const LERP_SPEED = 0.5;
const WEIGHT_MULTIPLIER = 5;

type Vector = {
  x: number;
  y: number;
};

const $canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const $video = document.createElement("video")!;

const context = $canvas.getContext("2d")!;

context.imageSmoothingEnabled = false;

const randomInt = (max: number) => Math.floor(Math.random() * max);

const getLuminosityFromBuffer = (
  buffer: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
) => {
  const index = (y * width + x) * 4;
  return (
    0.2126 * buffer[index] +
    0.7152 * buffer[index + 1] +
    0.0722 * buffer[index + 2]
  );
};

const calculateDelaunay = (points: Vector[]) => {
  const pointsArray = [];

  for (let vector of points) {
    pointsArray.push(vector.x, vector.y);
  }
  return new d3.Delaunay<number>(pointsArray);
};

const main = async ($canvas: HTMLCanvasElement, $video: HTMLVideoElement) => {
  const context = $canvas.getContext("2d")!;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { noiseSuppression: true },
    audio: false,
  });
  $video.srcObject = stream;

  $video.addEventListener("loadedmetadata", (_: Event) => {
    $canvas.width = $video.videoWidth;
    $canvas.height = $video.videoHeight;

    $video.play();
    $video.requestVideoFrameCallback(frame);
  });

  let delaunay: d3.Delaunay<number> | null = null;
  let voronoi: d3.Voronoi<number> | null = null;
  let points: Vector[] = [];

  context.fillStyle = "red";

  let currentFrame = -1;

  const frame = () => {
    currentFrame++;

    context.save();
    context.translate($video.videoWidth, 0);
    context.scale(-1, 1);
    context.drawImage($video, 0, 0, $video.videoWidth, $video.videoHeight);
    context.restore();

    const imageDataBuffer = context.getImageData(
      0,
      0,
      $canvas.width,
      $canvas.height,
    ).data;

    if (currentFrame === 0) {
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
    }

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
        // 1.5,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    $video.requestVideoFrameCallback(frame);
  };
};

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

      const weight = Math.pow(1 - luminosity / 255, 2);

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

main($canvas, $video);
