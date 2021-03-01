@def post_author = "Ole Kröger"
@def title = "How to create a new post?"
@def date = Date(2021, 03, 01)
@def desc = "How to create a new TWL post?"
@def rss = "How to create a new TWL post?"
@def rss_category = "julia"
@def tags = ["create-new-post"]
@def categories = Any[]
@def mintoclevel=2

Hey everyone and welcome to TWL - Today We Learned!

I'm Ole Kröger and I create some blogs posts on [opensourc.es](https://opensourc.es) about constraint programming, visualization and some posts about the basics of the [Julia programming language](https://julialang.org).

This project here is a new idea of increasing the number of blog posts in the Julia community by encouraging you and others to add what you have learned. I want to make it as simple as possible to create a blog post for you and distribute it to a wide range of people.

Not everyone of you need to create a blog, which is a daunting task. Maybe you just want to share a small fascinating feature with the world. This can range from a workflow of how to use your favorite IDE for Julia to new packages that you have found that you wish more people knew about. 

I would like to know what helps you to accomplish your goal and learn more about all the sides of the Julia community myself. 

Beginners can often explain what they have just learned after struggling for a bit way better than myself as I use Julia for quite some time now. 

## Want to get started?

You're interested in creating a new post yourself? Perfect welcome on board! 

There are a few steps you need to do to add your post to TWL!

1. Fork [https://github.com/Wikunia/twl](https://github.com/Wikunia/twl)
2. Clone the forked repo
3. Start Julia
4. Install [Franklin.jl](https://github.com/tlienart/Franklin.jl) if you haven't already 
   1. This can be done with `] add Franklin` (`]` brings you into package mode)
5. Run `include("franklin.jl")`
   1. `franklin.jl` makes it easier for you to preview your post and create the structure for your post.
6. Run `new_post("TITLE_OF_YOUR_POST"; tags=["TAG1, TAG2"])`
   1. This post has the tag `create-new-post` such that one can click on the link next to `Tags` at the beginning of this post
      to see all the posts with the same tag. You want to check if posts similar to your already exist and use this as category markers like
      `package`, `workflow`, `performance`, ...
7. This creates a new folder in `blog` and in `_assets/blog` for images that you want to add to your post 
8. You now want to update `@def post_author` with your name as well as `@def desc` and `@def rss` in the newly created `index.md`.
9. You're ready for the preview? Run `serve_twl()` and click on the `localhost` url to see your the blog locally.
10. Your new post should is listed first on the homepage. If you click on it and then change the new `index.md` it will show you the updated post live in your browser window.
11. Write your post :wink: More on that in a second
12. Commit your changes and create a PR. 

## How to use Franklin to write the post?

[Franklin.jl](https://github.com/tlienart/Franklin.jl) is the blogging framework that we use and you can check all the syntax you can use on the official documentation. 

Currently I only made one change to the general syntax for including images. You can include your graphics like you normally would in markdown syntax with `![test](test.png)` but I like them to be clickable such that you can write:

```
\figclick{test, ./images/logo.png}
```

This will show the image in `_assets/blog/YYYY-MM-DD-TITLE_OF_YOUR_POST/images/logo.png`.

Some other basics to get you started are math mode: `$f(x) = x^2$` will render to $f(x) = x^2$ and the multiline version with:

```
$$
f(x) = x^2
$$
```

as $$
f(x) = x^2
$$

to include code you can use three backticks:

`````
``` 
this is code
```
`````

I hope this gets you TWL started. Looking forward to your posts!

Please let me know of any issues in the issues section of [https://github.com/Wikunia/twl](https://github.com/Wikunia/twl)!

If you missed something in this short post please feel free to open a PR to make it easier for the next one.