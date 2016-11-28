/**
 * A hello world controller.
 *
 * @module controllers/Hello
 */
exports.World = function(){
    response.getWriter().println('Hello World!');
};
exports.World.public = true; 