/**
* Processes a product list item added to cart.
*
* Parameters:
* @input ProductListItem : dw.customer.ProductListItem - ProductListItem to
* @input Quantity : String - Quantity of the item added
*
*/
function execute(args) {
    var productListItem = args.ProductListItem;
    var quantity = args.Quantity;

    var eventsHelper = require('~/cartridge/scripts/pixlee/helpers/eventsHelper');
    eventsHelper.processAddProductListItem(productListItem, quantity);

    return PIPELET_NEXT;
}
