function scrollTo(hash) {
    location.hash = "#" + hash;
}

window.addEventListener('load', function() {
    let h1 = document.querySelectorAll("h1");
    if (h1.length >= 2) {
        let hash = h1[1].id;
        if (hash != "") {
            scrollTo(hash);
        }
    }
});

