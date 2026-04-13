// JavaScript code to inject into the page for DOM analysis - COMPATIBLE VERSION

export function getAccessibilityTreeScript(): string {
  return `
(function() {
  var refMap = {};
  var refCounter = 1;
  
  function getUniqueSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.className) return el.tagName.toLowerCase() + '.' + el.className.split(' ').join('.');
    return el.tagName.toLowerCase();
  }
  
  function getRole(element) {
    var ariaRole = element.getAttribute('role');
    if (ariaRole) return ariaRole;
    
    var tag = element.tagName.toLowerCase();
    var type = element.type;
    
    if (tag === 'a' && element.href) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
      if (type === 'hidden') return null;
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return element.multiple ? 'listbox' : 'combobox';
    if (tag === 'img') return element.alt ? 'img' : 'generic';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading';
    return 'generic';
  }
  
  function getAccessibleName(element) {
    var ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    var tag = element.tagName.toLowerCase();
    if (tag === 'a' || tag === 'button') return element.textContent || '';
    if (tag === 'input' || tag === 'textarea') return element.placeholder || '';
    if (tag === 'img') return element.alt || '';
    return element.textContent || '';
  }
  
  function isInteractive(role) {
    return role === 'button' || role === 'link' || role === 'textbox' || role === 'checkbox' || role === 'radio';
  }
  
  function isClickable(element) {
    return !!element.onclick || window.getComputedStyle(element).cursor === 'pointer';
  }
  
  function buildNode(element, depth) {
    depth = depth || 0;
    
    var role = getRole(element);
    if (!role) return null;
    
    var name = getAccessibleName(element);
    var interactive = isInteractive(role);
    
    var ref = null;
    if (interactive) {
      ref = 'e' + refCounter++;
      refMap[ref] = element;
    }
    
    var node = {
      role: role,
      name: name || undefined,
      ref: ref,
      level: undefined,
      checked: element.checked,
      disabled: element.disabled,
      placeholder: element.placeholder || undefined,
      value: element.value,
      url: element.href || undefined,
      children: []
    };
    
    if (depth < 10) {
      for (var i = 0; i < element.children.length; i++) {
        var childNode = buildNode(element.children[i], depth + 1);
        if (childNode) {
          node.children.push(childNode);
        }
      }
    }
    
    return node;
  }
  
  var root = buildNode(document.body, 0);
  
  var refsObj = {};
  for (var key in refMap) {
    var el = refMap[key];
    refsObj[key] = {
      tag: el.tagName.toLowerCase(),
      selector: getUniqueSelector(el)
    };
  }
  
  return {
    tree: root,
    refs: refsObj
  };
})()
`;
}

export function findElementByRefScript(ref: string): string {
  return '(function() { return null; })()';
}

export function waitForElementScript(selector: string, timeout: number): string {
  return '(function() { return new Promise(function(r) { r(null); }); })()';
}

export function waitForTextScript(text: string, timeout: number): string {
  return '(function() { return new Promise(function(r) { r(false); }); })()';
}
