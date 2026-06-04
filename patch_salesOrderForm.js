const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'views', 'inventory', 'salesOrderForm.ejs');
const recoveredPath = path.join(__dirname, 'recovered_salesOrderForm.ejs');

let content = fs.readFileSync(recoveredPath, 'utf8');

const oldBlockRegex = /window\.addEventListener\("load", async \(\) => \{[\s\S]*?\}\);[\s\n\r]*\/\/ ================= LOG EDIT \/ DELETE HANDLERS =================/;

const newLoadBlock = `  window.addEventListener("load", async () => {
    // 0. Initialize all Choices.js instances
    if (clientSelect) clientChoices = new Choices(clientSelect, { searchEnabled: true, itemSelectText: "" });
    if (userSelect) userChoices = new Choices(userSelect, { searchEnabled: true, itemSelectText: "" });
    if (locationSelect) locationChoices = new Choices(locationSelect, { searchEnabled: false, itemSelectText: "", shouldSort: false });
    if (itemTypeSelect) itemTypeChoices = new Choices(itemTypeSelect, { searchEnabled: true, itemSelectText: "" });
    if (itemSelect) itemChoices = new Choices(itemSelect, { searchEnabled: true, itemSelectText: "" });

    // Restore scroll position after log edit/delete reload
    const savedScroll = sessionStorage.getItem('logEditScrollY');
    if (savedScroll !== null) {
      sessionStorage.removeItem('logEditScrollY');
      requestAnimationFrame(() => window.scrollTo(0, parseInt(savedScroll)));
    }

    // 1. Parse URL parameters (type, client, user, item)
    const params = new URLSearchParams(window.location.search);
    let type = normalizeLookupText(params.get("type"));
    let client = normalizeLookupText(params.get("client"));
    let userId = normalizeLookupText(params.get("user"));
    let itemId = normalizeLookupText(params.get("item"));

    // 2. Identify "target" values (Prefer URL params, fallback to orderToEdit)
    const targetType = type || inferSalesOrderType(orderToEdit);
    const targetClient = client || orderToEdit?.userId?.clientName || "";
    const targetUserId = userId || (orderToEdit?.userId?._id ? String(orderToEdit.userId._id) : "");
    const targetItemId = itemId || (orderToEdit?.tapeBinding?._id ? String(orderToEdit.tapeBinding._id) : (orderToEdit?.tapeBinding ? String(orderToEdit.tapeBinding) : ""));

    // 3. Use await loadClients(targetType) if targetType exists
    if (targetType) {
      setChoiceValue(itemTypeChoices, itemTypeSelect, targetType);
      await loadClients(targetType);
    }

    // 4. Use await loadUsers(targetClient, targetUserId, targetItemId) if targetClient exists
    if (targetClient) {
      if (setChoiceValue(clientChoices, clientSelect, targetClient)) {
        await loadUsers(targetClient, targetUserId || null, targetItemId || null);
      }
    }

    // 5. Pre-fill non-dropdown fields (Quantity, PO Number, Date, Remarks) if orderToEdit exists
    if (orderToEdit) {
      if (orderToEdit.poNumber) poNumberInput.value = orderToEdit.poNumber;
      if (orderRateInput && typeof orderToEdit.orderRate !== "undefined" && orderToEdit.orderRate !== null) {
        orderRateInput.value = String(orderToEdit.orderRate);
        orderRateInput.dataset.fromOrder = "true";
      }
      if (orderToEdit.quantity) quantityInput.value = orderToEdit.quantity;
      if (orderToEdit.remarks) remarksInput.value = orderToEdit.remarks;
      if (orderToEdit.estimatedDate) {
        const d = new Date(orderToEdit.estimatedDate);
        estimatedDateInput.value = \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
      }
      
      // Standard edit mode location sync (if not confirmMode, as confirmMode has stricter locking)
      if (!confirmMode) {
        await updateStockDisplay();
        if (orderToEdit.sourceLocation) {
          syncSourceLocation(orderToEdit.sourceLocation);
          selectStockLocation(orderToEdit.sourceLocation);
        }
      }
    }

    // 6. Handle confirmMode (lock fields, set confirm-specific defaults)
    if (confirmMode && orderToEdit) {
      const today = new Date();
      const confirmDateInput = document.getElementById('confirm-date');
      const confirmQtyInput = document.getElementById('confirm-quantity');
      const invoiceInput = document.getElementById('invoice-number');

      if (confirmDateInput) confirmDateInput.value = \`\${today.getFullYear()}-\${String(today.getMonth() + 1).padStart(2, '0')}-\${String(today.getDate()).padStart(2, '0')}\`;
      if (confirmQtyInput) confirmQtyInput.value = (orderToEdit.quantity - (orderToEdit.dispatchedQuantity || 0));

      if (invoiceInput) {
        const startYear = (today.getMonth() + 1) < 4 ? today.getFullYear() - 1 : today.getFullYear();
        const finYearStr = \`\${String(startYear).slice(-2)}-\${String(startYear + 1).slice(-2)}\`;
        let typePrefix = targetType === "POS_ROLL" ? "POSROLL" : (targetType || "");
        if (typePrefix) invoiceInput.value = \`TECH|\${finYearStr}|\${typePrefix}|\`;
      }

      // Lock everything
      itemTypeChoices?.disable();
      clientChoices?.disable();
      userChoices?.disable();
      itemChoices?.disable();
      quantityInput.readOnly = true;
      poNumberInput.readOnly = !!orderToEdit.poNumber;
      if (orderRateInput) orderRateInput.readOnly = true;
      estimatedDateInput.readOnly = true;
      remarksInput.readOnly = true;
      locationChoices?.disable();

      // Ensure correct source location is locked and enforced
      const initialDispatchLocation = normalizeLocationName(orderToEdit.sourceLocation || orderToEdit.userId?.userLocation || "");
      if (initialDispatchLocation) {
        lockDispatchLocation(initialDispatchLocation);
        enforceLockedDispatchLocation();
      }
    }
  });

  // ================= LOG EDIT / DELETE HANDLERS =================`;

content = content.replace(oldBlockRegex, newLoadBlock);

fs.writeFileSync(filePath, content);
console.log('Successfully patched salesOrderForm.ejs');
