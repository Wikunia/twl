var coll = document.getElementsByClassName("collapsible");
var i;

function getClassNames(ele) {
  let classNames = ele.className;
  return classNames.split(" ");
}


for (i = 0; i < coll.length; i++) {
  coll[i].addEventListener("click", function() {
    this.classList.toggle("active");
    var content = this.nextElementSibling;
    if (content.style.display === "block") {
      content.style.display = "none";
    } else {
      content.style.display = "block";
    }
  });
}

let url = window.location.href;
let post = url.split("/blog/")[1];
if (post !== undefined) {
  let post_class = post.split("-");
  post_class = post_class[0]+"-"+post_class[1];
  
  for (i = 0; i < coll.length; i++) {
    let classNames = getClassNames(coll[i]);
    if (classNames.includes("collapsible-"+post_class)) {
      coll[i].click();
    }
  }
}
