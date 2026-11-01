// Dish photo URL at a given width. The API serves cached, resized WebP copies.
export const imgUrl = (id, w) => `/api/images/${id}${w ? `?w=${w}` : ''}`;

// For <img srcSet>: the browser picks the smallest copy that is sharp on this screen.
export const imgSrcSet = (id) => `${imgUrl(id, 240)} 240w, ${imgUrl(id, 480)} 480w, ${imgUrl(id, 800)} 800w`;

// The dish with its background removed (transparent WebP), for dishes where `dish.cutout` is true.
export const cutUrl = (id, w) => `/api/images/${id}?cut=1${w ? `&w=${w}` : ''}`;

// Depth map of the photo (brighter = nearer), for dishes where `dish.depth` is true.
export const depthUrl = (id, w) => `/api/images/${id}?depth=1${w ? `&w=${w}` : ''}`;
